package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:resource:shortName=ss
type ScheduledScaling struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   ScheduledScalingSpec   `json:"spec,omitempty"`
	Status ScheduledScalingStatus `json:"status,omitempty"`
}

type ScheduledScalingSpec struct {
	TargetRef TargetRef `json:"targetRef"`
	Schedule ScheduleSpec `json:"schedule"`
	Scaling ScalingSpec `json:"scaling"`
	// +optional
	Revert bool `json:"revert,omitempty"`
}

// +k8s:deepcopy-gen=true
type TargetRef struct {
	// +optional
	APIVersion string `json:"apiVersion,omitempty"`
	Kind string `json:"kind"`
	Name string `json:"name"`
	// +optional
	Namespace string `json:"namespace,omitempty"`
}

type ScheduleSpec struct {
	// +optional
	StartTime string `json:"startTime,omitempty"`
	// +optional
	EndTime string `json:"endTime,omitempty"`
	// +optional
	Recurrence *RecurrenceSpec `json:"recurrence,omitempty"`
}

type RecurrenceSpec struct {
	Schedule string `json:"schedule"`
	Duration string `json:"duration"`
	// +optional
	Timezone string `json:"timezone,omitempty"`
	// +optional
	StartingDeadlineSeconds *int64 `json:"startingDeadlineSeconds,omitempty"`
	// +optional
	SuccessfulJobsHistoryLimit *int32 `json:"successfulJobsHistoryLimit,omitempty"`
	// +optional
	FailedJobsHistoryLimit *int32 `json:"failedJobsHistoryLimit,omitempty"`
}

type ScalingSpec struct {
	// +optional
	MinReplicas *int32 `json:"minReplicas,omitempty"`
	// +optional
	MaxReplicas *int32 `json:"maxReplicas,omitempty"`
}

type ScheduledScalingStatus struct {
	// +optional
	Phase string `json:"phase,omitempty"`
	// +optional
	AppliedAt string `json:"appliedAt,omitempty"`
	// +optional
	RevertedAt string `json:"revertedAt,omitempty"`
	// +optional
	OriginalMinReplicas *int32 `json:"originalMinReplicas,omitempty"`
	// +optional
	OriginalMaxReplicas *int32 `json:"originalMaxReplicas,omitempty"`
	// +optional
	Message string `json:"message,omitempty"`
}

// +kubebuilder:object:root=true
type ScheduledScalingList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ScheduledScaling `json:"items"`
}
