package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	autoscalingv2 "k8s.io/api/autoscaling/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"

	scalingv1alpha1 "github.com/smoothzz/kubernetes-scheduled-scaling/pkg/apis/scaling/v1alpha1"
)

var (
	dynamicClient dynamic.Interface
	clientset     *kubernetes.Clientset
	restClient    rest.Interface
	gvr           = schema.GroupVersionResource{
		Group:    "scaling.kubernetes.io",
		Version:  "v1alpha1",
		Resource: "scheduledscalings",
	}
)

func init() {
	scalingv1alpha1.SchemeBuilder.AddToScheme(scheme.Scheme)
}

func main() {
	config, err := rest.InClusterConfig()
	if err != nil {
		config, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
		if err != nil {
			log.Fatalf("Error building kubeconfig: %v", err)
		}
	}

	dynamicClient, err = dynamic.NewForConfig(config)
	if err != nil {
		log.Fatalf("Error creating dynamic client: %v", err)
	}

	clientset, err = kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Error creating kubernetes client: %v", err)
	}

	restConfig := rest.CopyConfig(config)
	restConfig.GroupVersion = &schema.GroupVersion{Group: "scaling.kubernetes.io", Version: "v1alpha1"}
	restConfig.APIPath = "/apis"
	restConfig.ContentType = runtime.ContentTypeJSON
	restConfig.NegotiatedSerializer = scheme.Codecs
	restClient, err = rest.RESTClientFor(restConfig)
	if err != nil {
		log.Fatalf("Error creating REST client: %v", err)
	}

	http.HandleFunc("/api/v1/scheduledscalings", handleScheduledScalings)
	http.HandleFunc("/api/v1/scheduledscalings/", handleScheduledScaling)
	http.HandleFunc("/api/v1/scheduledscalings/batch/cancel", handleBatchCancel)
	http.HandleFunc("/api/v1/hpas", handleHPAs)
	http.HandleFunc("/api/v1/namespaces", handleNamespaces)
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	log.Println("API server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func handleScheduledScalings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case "GET":
		listScheduledScalings(w, r)
	case "POST":
		createScheduledScaling(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleScheduledScaling(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, DELETE, PATCH, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := r.URL.Path[len("/api/v1/scheduledscalings/"):]
	parts := splitPath(path)
	if len(parts) < 1 {
		http.Error(w, "Invalid path", http.StatusBadRequest)
		return
	}

	name := parts[0]
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default"
	}
	if len(parts) > 1 {
		namespace = parts[1]
	}

	switch r.Method {
	case "GET":
		getScheduledScaling(w, r, name, namespace)
	case "PUT":
		updateScheduledScaling(w, r, name, namespace)
	case "PATCH":
		var action struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(r.Body).Decode(&action); err != nil {
			http.Error(w, fmt.Sprintf("Error decoding request: %v", err), http.StatusBadRequest)
			return
		}
		if action.Action == "cancel" || action.Action == "revert" {
			cancelOrRevertScheduledScaling(w, r, name, namespace, action.Action)
		} else {
			http.Error(w, "Invalid action. Use 'cancel' or 'revert'", http.StatusBadRequest)
		}
	case "DELETE":
		deleteScheduledScaling(w, r, name, namespace)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func listScheduledScalings(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	if namespace == "" {
		namespace = "default"
	}

	list, err := dynamicClient.Resource(gvr).Namespace(namespace).List(r.Context(), metav1.ListOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error listing scheduledscalings: %v", err), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(list.Items)
}

func getScheduledScaling(w http.ResponseWriter, r *http.Request, name, namespace string) {
	obj, err := dynamicClient.Resource(gvr).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting scheduledscaling: %v", err), http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(obj)
}

func createScheduledScaling(w http.ResponseWriter, r *http.Request) {
	var ss scalingv1alpha1.ScheduledScaling
	if err := json.NewDecoder(r.Body).Decode(&ss); err != nil {
		http.Error(w, fmt.Sprintf("Error decoding request: %v", err), http.StatusBadRequest)
		return
	}

	if ss.Name == "" {
		ss.Name = fmt.Sprintf("scheduledscaling-%d", time.Now().Unix())
	}
	if ss.Namespace == "" {
		ss.Namespace = "default"
	}
	ss.APIVersion = "scaling.kubernetes.io/v1alpha1"
	ss.Kind = "ScheduledScaling"

	unstructuredMap, err := runtime.DefaultUnstructuredConverter.ToUnstructured(&ss)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error converting: %v", err), http.StatusInternalServerError)
		return
	}

	unstructuredObj := &unstructured.Unstructured{Object: unstructuredMap}
	obj, err := dynamicClient.Resource(gvr).Namespace(ss.Namespace).Create(
		r.Context(),
		unstructuredObj,
		metav1.CreateOptions{},
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error creating scheduledscaling: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(obj)
}

func updateScheduledScaling(w http.ResponseWriter, r *http.Request, name, namespace string) {
	var ss scalingv1alpha1.ScheduledScaling
	if err := json.NewDecoder(r.Body).Decode(&ss); err != nil {
		http.Error(w, fmt.Sprintf("Error decoding request: %v", err), http.StatusBadRequest)
		return
	}

	ss.Name = name
	ss.Namespace = namespace
	ss.APIVersion = "scaling.kubernetes.io/v1alpha1"
	ss.Kind = "ScheduledScaling"

	unstructuredMap, err := runtime.DefaultUnstructuredConverter.ToUnstructured(&ss)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error converting: %v", err), http.StatusInternalServerError)
		return
	}

	unstructuredObj := &unstructured.Unstructured{Object: unstructuredMap}
	obj, err := dynamicClient.Resource(gvr).Namespace(namespace).Update(
		r.Context(),
		unstructuredObj,
		metav1.UpdateOptions{},
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error updating scheduledscaling: %v", err), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(obj)
}

func deleteScheduledScaling(w http.ResponseWriter, r *http.Request, name, namespace string) {
	err := dynamicClient.Resource(gvr).Namespace(namespace).Delete(r.Context(), name, metav1.DeleteOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error deleting scheduledscaling: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func cancelOrRevertScheduledScaling(w http.ResponseWriter, r *http.Request, name, namespace, action string) {
	obj, err := dynamicClient.Resource(gvr).Namespace(namespace).Get(r.Context(), name, metav1.GetOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting scheduledscaling: %v", err), http.StatusNotFound)
		return
	}

	var ss scalingv1alpha1.ScheduledScaling
	if err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.Object, &ss); err != nil {
		http.Error(w, fmt.Sprintf("Error converting scheduledscaling: %v", err), http.StatusInternalServerError)
		return
	}

	if action == "revert" {
		if ss.Status.Phase != "Active" {
			http.Error(w, "ScheduledScaling is not active, cannot revert", http.StatusBadRequest)
			return
		}
	}

	statusPatch := map[string]interface{}{
		"status": map[string]interface{}{
			"phase": "Cancelled",
		},
	}
	if action == "cancel" {
		statusPatch["status"].(map[string]interface{})["message"] = "Cancelled manually"
	} else {
		statusPatch["status"].(map[string]interface{})["message"] = "Reverting manually"
	}

	if status, found := obj.Object["status"]; found {
		if statusMap, ok := status.(map[string]interface{}); ok {
			for k, v := range statusMap {
				if _, exists := statusPatch["status"].(map[string]interface{})[k]; !exists {
					statusPatch["status"].(map[string]interface{})[k] = v
				}
			}
		}
	}

	patchData, err := json.Marshal(statusPatch)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error marshaling patch: %v", err), http.StatusInternalServerError)
		return
	}

	path := fmt.Sprintf("/apis/scaling.kubernetes.io/v1alpha1/namespaces/%s/scheduledscalings/%s/status", namespace, name)
	result := restClient.Patch(types.MergePatchType).
		AbsPath(path).
		Body(patchData).
		Do(r.Context())

	if result.Error() != nil {
		http.Error(w, fmt.Sprintf("Error patching status: %v", result.Error()), http.StatusInternalServerError)
		return
	}

	raw, err := result.Raw()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error getting raw response: %v", err), http.StatusInternalServerError)
		return
	}

	var updatedObj map[string]interface{}
	if err := json.Unmarshal(raw, &updatedObj); err != nil {
		http.Error(w, fmt.Sprintf("Error parsing response: %v", err), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(updatedObj)
}

func handleBatchCancel(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var request struct {
		ScheduledScalings []struct {
			Name      string `json:"name"`
			Namespace string `json:"namespace"`
		} `json:"scheduledscalings"`
		Action string `json:"action"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, fmt.Sprintf("Error decoding request: %v", err), http.StatusBadRequest)
		return
	}

	if request.Action != "cancel" && request.Action != "revert" {
		http.Error(w, "Invalid action. Use 'cancel' or 'revert'", http.StatusBadRequest)
		return
	}

	results := make([]map[string]interface{}, 0)
	errors := make([]string, 0)

	for _, ss := range request.ScheduledScalings {
		ns := ss.Namespace
		if ns == "" {
			ns = "default"
		}

		obj, err := dynamicClient.Resource(gvr).Namespace(ns).Get(r.Context(), ss.Name, metav1.GetOptions{})
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s/%s: %v", ns, ss.Name, err))
			continue
		}

		var ssObj scalingv1alpha1.ScheduledScaling
		if err := runtime.DefaultUnstructuredConverter.FromUnstructured(obj.Object, &ssObj); err != nil {
			errors = append(errors, fmt.Sprintf("%s/%s: %v", ns, ss.Name, err))
			continue
		}

		if request.Action == "cancel" {
			ssObj.Status.Phase = "Cancelled"
			ssObj.Status.Message = "Cancelled manually (batch)"
		} else if request.Action == "revert" {
			if ssObj.Status.Phase == "Active" {
				ssObj.Status.Phase = "Cancelled"
				ssObj.Status.Message = "Reverting manually (batch)"
			} else {
				errors = append(errors, fmt.Sprintf("%s/%s: not active, cannot revert", ns, ss.Name))
				continue
			}
		}

		unstructuredMap, err := runtime.DefaultUnstructuredConverter.ToUnstructured(&ssObj)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s/%s: %v", ns, ss.Name, err))
			continue
		}

		unstructuredObj := &unstructured.Unstructured{Object: unstructuredMap}
		updated, err := dynamicClient.Resource(gvr).Namespace(ns).Update(
			r.Context(),
			unstructuredObj,
			metav1.UpdateOptions{},
		)
		if err != nil {
			errors = append(errors, fmt.Sprintf("%s/%s: %v", ns, ss.Name, err))
			continue
		}

		results = append(results, updated.Object)
	}

	response := map[string]interface{}{
		"success": len(results),
		"errors":  len(errors),
		"results": results,
	}
	if len(errors) > 0 {
		response["errorMessages"] = errors
	}

	json.NewEncoder(w).Encode(response)
}

func handleHPAs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	var hpas []autoscalingv2.HorizontalPodAutoscaler

	if namespace != "" {
		list, err := clientset.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(r.Context(), metav1.ListOptions{})
		if err != nil {
			http.Error(w, fmt.Sprintf("Error listing HPAs: %v", err), http.StatusInternalServerError)
			return
		}
		hpas = list.Items
	} else {
		namespaces, err := clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
		if err != nil {
			http.Error(w, fmt.Sprintf("Error listing namespaces: %v", err), http.StatusInternalServerError)
			return
		}

		for _, ns := range namespaces.Items {
			list, err := clientset.AutoscalingV2().HorizontalPodAutoscalers(ns.Name).List(r.Context(), metav1.ListOptions{})
			if err != nil {
				continue
			}
			hpas = append(hpas, list.Items...)
		}
	}

	result := make([]map[string]string, 0)
	for _, hpa := range hpas {
		result = append(result, map[string]string{
			"name":      hpa.Name,
			"namespace": hpa.Namespace,
		})
	}

	json.NewEncoder(w).Encode(result)
}

func handleNamespaces(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	namespaces, err := clientset.CoreV1().Namespaces().List(r.Context(), metav1.ListOptions{})
	if err != nil {
		http.Error(w, fmt.Sprintf("Error listing namespaces: %v", err), http.StatusInternalServerError)
		return
	}

	result := make([]string, 0)
	for _, ns := range namespaces.Items {
		result = append(result, ns.Name)
	}

	json.NewEncoder(w).Encode(result)
}

func splitPath(path string) []string {
	var parts []string
	var current string
	for _, char := range path {
		if char == '/' {
			if current != "" {
				parts = append(parts, current)
				current = ""
			}
		} else {
			current += string(char)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}
