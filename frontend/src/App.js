import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format } from 'date-fns';
import './index.css';

const getApiUrl = () => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.includes('localhost')) {
    return '';
  }
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  return '';
};

const API_BASE_URL = getApiUrl();

function App() {
  const [scheduledScalings, setScheduledScalings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingScheduledScaling, setEditingScheduledScaling] = useState(null);
  const [selectedScheduledScalings, setSelectedScheduledScalings] = useState(new Set());
  const [hpas, setHpas] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNamespace, setSelectedNamespace] = useState('default');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const [formData, setFormData] = useState({
    name: '',
    namespace: 'default',
    targetKind: 'HorizontalPodAutoscaler',
    targetName: '',
    targetNamespace: '',
    scheduleType: 'onetime',
    startTime: '',
    endTime: '',
    recurrenceSchedule: '',
    recurrenceDuration: '',
    recurrenceTimezone: 'UTC',
    minReplicas: '',
    maxReplicas: '',
    revert: false,
  });

  useEffect(() => {
    fetchScheduledScalings();
    fetchHPAs();
    fetchNamespaces();
    const interval = setInterval(fetchScheduledScalings, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchScheduledScalings();
  }, [selectedNamespace]);

  useEffect(() => {
    fetchHPAs();
  }, [formData.targetNamespace, formData.namespace]);

  const fetchScheduledScalings = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/api/v1/scheduledscalings?namespace=${selectedNamespace}`);
      setScheduledScalings(response.data);
      setError(null);
    } catch (err) {
      setError(`Failed to fetch scheduledscalings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchHPAs = async (namespace = null) => {
    try {
      const url = namespace 
        ? `${API_BASE_URL}/api/v1/hpas?namespace=${namespace}`
        : `${API_BASE_URL}/api/v1/hpas`;
      const response = await axios.get(url);
      setHpas(response.data);
    } catch (err) {
      console.error('Failed to fetch HPAs:', err);
    }
  };

  const fetchNamespaces = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/v1/namespaces`);
      setNamespaces(response.data);
    } catch (err) {
      console.error('Failed to fetch namespaces:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (formData.scheduleType === 'recurring') {
      if (!formData.recurrenceSchedule || !formData.recurrenceDuration) {
        setError('Cron schedule and duration are required for recurring schedules');
        return;
      }
    } else {
      if (!formData.startTime) {
        setError('Start time is required for one-time schedules');
        return;
      }
    }

    try {
      const scheduledScalingData = {
        apiVersion: 'scaling.kubernetes.io/v1alpha1',
        kind: 'ScheduledScaling',
        metadata: {
          name: formData.name || `scheduledscaling-${Date.now()}`,
          namespace: formData.namespace,
        },
        spec: {
          targetRef: {
            apiVersion: 'autoscaling/v2',
            kind: formData.targetKind,
            name: formData.targetName,
            namespace: formData.targetNamespace || formData.namespace,
          },
          schedule: {},
          scaling: {
            minReplicas: formData.minReplicas ? parseInt(formData.minReplicas) : null,
            maxReplicas: formData.maxReplicas ? parseInt(formData.maxReplicas) : null,
          },
        },
      };

      if (formData.scheduleType === 'recurring') {
        scheduledScalingData.spec.schedule.recurrence = {
          schedule: formData.recurrenceSchedule,
          duration: formData.recurrenceDuration,
        };
        if (formData.recurrenceTimezone && formData.recurrenceTimezone !== 'UTC') {
          scheduledScalingData.spec.schedule.recurrence.timezone = formData.recurrenceTimezone;
        }
      } else {
        scheduledScalingData.spec.schedule.startTime = new Date(formData.startTime).toISOString();
        if (formData.endTime) {
          scheduledScalingData.spec.schedule.endTime = new Date(formData.endTime).toISOString();
        }
      }

      if (formData.revert === true) {
        scheduledScalingData.spec.revert = true;
      }

      if (editingScheduledScaling) {
        await axios.put(
          `${API_BASE_URL}/api/v1/scheduledscalings/${editingScheduledScaling.metadata.name}?namespace=${editingScheduledScaling.metadata.namespace}`,
          scheduledScalingData
        );
        setSuccess('ScheduledScaling updated successfully!');
      } else {
        await axios.post(`${API_BASE_URL}/api/v1/scheduledscalings`, scheduledScalingData);
        setSuccess('ScheduledScaling created successfully!');
      }

      resetForm();
      fetchScheduledScalings();
    } catch (err) {
      setError(`Failed to ${editingScheduledScaling ? 'update' : 'create'} scheduledscaling: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDelete = async (ss) => {
    if (!window.confirm(`Are you sure you want to delete scheduledscaling "${ss.metadata.name}"?`)) {
      return;
    }

    try {
      await axios.delete(
        `${API_BASE_URL}/api/v1/scheduledscalings/${ss.metadata.name}?namespace=${ss.metadata.namespace}`
      );
      setSuccess('ScheduledScaling deleted successfully!');
      fetchScheduledScalings();
    } catch (err) {
      setError(`Failed to delete scheduledscaling: ${err.message}`);
    }
  };

  const handleCancel = async (ss) => {
    if (!window.confirm(`Are you sure you want to cancel scheduledscaling "${ss.metadata.name}"?`)) {
      return;
    }

    try {
      await axios.patch(
        `${API_BASE_URL}/api/v1/scheduledscalings/${ss.metadata.name}?namespace=${ss.metadata.namespace}`,
        { action: 'cancel' }
      );
      setSuccess('ScheduledScaling cancelled successfully!');
      fetchScheduledScalings();
    } catch (err) {
      setError(`Failed to cancel scheduledscaling: ${err.message}`);
    }
  };

  const handleRevert = async (ss) => {
    if (!window.confirm(`Are you sure you want to revert scheduledscaling "${ss.metadata.name}"? This will immediately revert the scaling.`)) {
      return;
    }

    try {
      await axios.patch(
        `${API_BASE_URL}/api/v1/scheduledscalings/${ss.metadata.name}?namespace=${ss.metadata.namespace}`,
        { action: 'revert' }
      );
      setSuccess('ScheduledScaling reverted successfully!');
      fetchScheduledScalings();
    } catch (err) {
      setError(`Failed to revert scheduledscaling: ${err.message}`);
    }
  };

  const handleBatchCancel = async (action) => {
    if (selectedScheduledScalings.size === 0) {
      setError('Please select at least one scheduledscaling');
      return;
    }

    const actionText = action === 'cancel' ? 'cancel' : 'revert';
    if (!window.confirm(`Are you sure you want to ${actionText} ${selectedScheduledScalings.size} scheduledscaling(s)?`)) {
      return;
    }

    try {
      const scheduledscalingsToProcess = Array.from(selectedScheduledScalings).map(id => {
        const ss = scheduledScalings.find(b => b.metadata.uid === id);
        return {
          name: ss.metadata.name,
          namespace: ss.metadata.namespace,
        };
      });

      const response = await axios.post(
        `${API_BASE_URL}/api/v1/scheduledscalings/batch/cancel`,
        {
          scheduledscalings: scheduledscalingsToProcess,
          action: action,
        }
      );

      if (response.data.errors > 0) {
        setError(`Some scheduledscalings failed to ${actionText}. Success: ${response.data.success}, Errors: ${response.data.errors}`);
      } else {
        setSuccess(`Successfully ${actionText}ed ${response.data.success} scheduledscaling(s)!`);
      }
      setSelectedScheduledScalings(new Set());
      fetchScheduledScalings();
    } catch (err) {
      setError(`Failed to ${actionText} scheduledscalings: ${err.message}`);
    }
  };

  const toggleScheduledScalingSelection = (scheduledscalingId) => {
    const newSelection = new Set(selectedScheduledScalings);
    if (newSelection.has(scheduledscalingId)) {
      newSelection.delete(scheduledscalingId);
    } else {
      newSelection.add(scheduledscalingId);
    }
    setSelectedScheduledScalings(newSelection);
  };

  const toggleAllScheduledScalings = () => {
    if (selectedScheduledScalings.size === scheduledScalings.length) {
      setSelectedScheduledScalings(new Set());
    } else {
      setSelectedScheduledScalings(new Set(scheduledScalings.map(b => b.metadata.uid)));
    }
  };

  const handleEdit = (ss) => {
    setEditingScheduledScaling(ss);
    const hasRecurrence = ss.spec.schedule.recurrence != null;
    setFormData({
      name: ss.metadata.name,
      namespace: ss.metadata.namespace,
      targetKind: ss.spec.targetRef.kind,
      targetName: ss.spec.targetRef.name,
      targetNamespace: ss.spec.targetRef.namespace || ss.metadata.namespace,
      scheduleType: hasRecurrence ? 'recurring' : 'onetime',
      startTime: ss.spec.schedule.startTime ? format(new Date(ss.spec.schedule.startTime), "yyyy-MM-dd'T'HH:mm") : '',
      endTime: ss.spec.schedule.endTime ? format(new Date(ss.spec.schedule.endTime), "yyyy-MM-dd'T'HH:mm") : '',
      recurrenceSchedule: ss.spec.schedule.recurrence?.schedule || '',
      recurrenceDuration: ss.spec.schedule.recurrence?.duration || '',
      recurrenceTimezone: ss.spec.schedule.recurrence?.timezone || 'UTC',
      minReplicas: ss.spec.scaling.minReplicas || '',
      maxReplicas: ss.spec.scaling.maxReplicas || '',
      revert: ss.spec.revert === true,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      namespace: 'default',
      targetKind: 'HorizontalPodAutoscaler',
      targetName: '',
      targetNamespace: '',
      scheduleType: 'onetime',
      startTime: '',
      endTime: '',
      recurrenceSchedule: '',
      recurrenceDuration: '',
      recurrenceTimezone: 'UTC',
      minReplicas: '',
      maxReplicas: '',
      revert: false,
    });
    setEditingScheduledScaling(null);
    setShowForm(false);
  };

  const getStatusBadge = (phase) => {
    const statusClass = `status-${phase?.toLowerCase() || 'pending'}`;
    return <span className={`status-badge ${statusClass}`}>{phase || 'Pending'}</span>;
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedScheduledScalings = () => {
    if (!sortConfig.key) {
      return scheduledScalings;
    }

    const sorted = [...scheduledScalings].sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.key) {
        case 'name':
          aValue = a.metadata.name?.toLowerCase() || '';
          bValue = b.metadata.name?.toLowerCase() || '';
          break;
        case 'target':
          aValue = `${a.spec.targetRef.kind}/${a.spec.targetRef.name}`.toLowerCase();
          bValue = `${b.spec.targetRef.kind}/${b.spec.targetRef.name}`.toLowerCase();
          break;
        case 'schedule':
          if (a.spec.schedule.recurrence) {
            aValue = a.spec.schedule.recurrence.schedule || '';
          } else {
            aValue = a.spec.schedule.startTime ? new Date(a.spec.schedule.startTime).getTime() : 0;
          }
          if (b.spec.schedule.recurrence) {
            bValue = b.spec.schedule.recurrence.schedule || '';
          } else {
            bValue = b.spec.schedule.startTime ? new Date(b.spec.schedule.startTime).getTime() : 0;
          }
          break;
        case 'end':
          if (a.spec.schedule.recurrence) {
            aValue = a.spec.schedule.recurrence.duration || '';
          } else {
            aValue = a.spec.schedule.endTime ? new Date(a.spec.schedule.endTime).getTime() : 0;
          }
          if (b.spec.schedule.recurrence) {
            bValue = b.spec.schedule.recurrence.duration || '';
          } else {
            bValue = b.spec.schedule.endTime ? new Date(b.spec.schedule.endTime).getTime() : 0;
          }
          break;
        case 'replicas':
          aValue = (a.spec.scaling.minReplicas || 0) + (a.spec.scaling.maxReplicas || 0);
          bValue = (b.spec.scaling.minReplicas || 0) + (b.spec.scaling.maxReplicas || 0);
          break;
        case 'status':
          aValue = (a.status?.phase || 'Pending').toLowerCase();
          bValue = (b.status?.phase || 'Pending').toLowerCase();
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      } else {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
    });

    return sorted;
  };

  const SortIndicator = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <span className="sort-indicator">↕</span>;
    }
    return <span className="sort-indicator">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="app">
      <div className="header">
        <h1>🚀 Kubernetes Scheduled Scaling</h1>
        <p>Manage scheduled scale-up and scale-down operations for your applications</p>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div className="success">{success}</div>}

      <div className="scheduledscaling-form">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>{editingScheduledScaling ? 'Edit ScheduledScaling' : 'Create New ScheduledScaling'}</h2>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + New ScheduledScaling
            </button>
          )}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ marginRight: '10px' }}>Filter by Namespace:</label>
          <select
            value={selectedNamespace}
            onChange={(e) => setSelectedNamespace(e.target.value)}
            style={{ padding: '5px', minWidth: '200px' }}
          >
            {namespaces.map(ns => (
              <option key={ns} value={ns}>{ns}</option>
            ))}
          </select>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>ScheduledScaling Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Auto-generated if empty"
                />
              </div>
              <div className="form-group">
                <label>Namespace</label>
                <select
                  value={formData.namespace}
                  onChange={(e) => {
                    setFormData({ ...formData, namespace: e.target.value, targetName: '' });
                    fetchHPAs(e.target.value);
                  }}
                  required
                >
                  {namespaces.map(ns => (
                    <option key={ns} value={ns}>{ns}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Target Type</label>
                <select
                  value={formData.targetKind}
                  onChange={(e) => setFormData({ ...formData, targetKind: e.target.value })}
                >
                  <option value="HorizontalPodAutoscaler">HPA</option>
                  <option value="ScaledObject">KEDA ScaledObject</option>
                </select>
              </div>
              <div className="form-group">
                <label>Target HPA</label>
                <select
                  value={formData.targetName}
                  onChange={(e) => {
                    const selected = hpas.find(h => h.name === e.target.value);
                    setFormData({
                      ...formData,
                      targetName: e.target.value,
                      targetNamespace: selected ? selected.namespace : (formData.targetNamespace || formData.namespace),
                    });
                  }}
                  required
                >
                  <option value="">Select HPA...</option>
                  {hpas
                    .filter(h => h.namespace === (formData.targetNamespace || formData.namespace))
                    .map(hpa => (
                      <option key={`${hpa.namespace}/${hpa.name}`} value={hpa.name}>
                        {hpa.name} ({hpa.namespace})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Target Namespace (optional, defaults to scheduledscaling namespace)</label>
              <select
                value={formData.targetNamespace}
                onChange={(e) => {
                  setFormData({ ...formData, targetNamespace: e.target.value, targetName: '' });
                  fetchHPAs(e.target.value || formData.namespace);
                }}
              >
                <option value="">Same as scheduledscaling namespace</option>
                {namespaces.map(ns => (
                  <option key={ns} value={ns}>{ns}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Schedule Type</label>
              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="scheduleType"
                    value="onetime"
                    checked={formData.scheduleType === 'onetime'}
                    onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value })}
                    style={{ marginRight: '8px' }}
                  />
                  One-time Schedule
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="scheduleType"
                    value="recurring"
                    checked={formData.scheduleType === 'recurring'}
                    onChange={(e) => setFormData({ ...formData, scheduleType: e.target.value })}
                    style={{ marginRight: '8px' }}
                  />
                  Recurring Schedule (Cron)
                </label>
              </div>
            </div>

            {formData.scheduleType === 'onetime' ? (
              <div className="form-row">
                <div className="form-group">
                  <label>Start Time</label>
                  <input
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Time (optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Cron Schedule</label>
                    <input
                      type="text"
                      value={formData.recurrenceSchedule}
                      onChange={(e) => setFormData({ ...formData, recurrenceSchedule: e.target.value })}
                      placeholder="0 17 * * 1"
                      required
                    />
                    <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
                      Format: minute hour day-of-month month day-of-week (e.g., "0 17 * * 1" = Every Monday at 5pm)
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Duration</label>
                    <input
                      type="text"
                      value={formData.recurrenceDuration}
                      onChange={(e) => setFormData({ ...formData, recurrenceDuration: e.target.value })}
                      placeholder="3h"
                      required
                    />
                    <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
                      How long the scaling should remain active (e.g., "3h", "30m", "2h30m")
                    </small>
                  </div>
                </div>
                <div className="form-group">
                  <label>Timezone (optional)</label>
                  <input
                    type="text"
                    value={formData.recurrenceTimezone}
                    onChange={(e) => setFormData({ ...formData, recurrenceTimezone: e.target.value })}
                    placeholder="UTC"
                  />
                  <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>
                    Timezone for the cron schedule (e.g., "America/New_York", "Europe/London"). Defaults to UTC.
                  </small>
                </div>
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Min Replicas</label>
                <input
                  type="number"
                  min="0"
                  value={formData.minReplicas}
                  onChange={(e) => setFormData({ ...formData, minReplicas: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Max Replicas</label>
                <input
                  type="number"
                  min="1"
                  value={formData.maxReplicas}
                  onChange={(e) => setFormData({ ...formData, maxReplicas: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.revert}
                  onChange={(e) => setFormData({ ...formData, revert: e.target.checked })}
                />
                {' '}Auto-revert after end time
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" className="btn btn-primary">
                {editingScheduledScaling ? 'Update' : 'Create'} ScheduledScaling
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="scheduledscalings-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>ScheduledScalings</h2>
          {selectedScheduledScalings.size > 0 && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-danger"
                onClick={() => handleBatchCancel('cancel')}
              >
                Cancel Selected ({selectedScheduledScalings.size})
              </button>
              <button
                className="btn btn-warning"
                onClick={() => handleBatchCancel('revert')}
              >
                Revert Selected ({selectedScheduledScalings.size})
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="loading">Loading scheduledscalings...</div>
        ) : scheduledScalings.length === 0 ? (
          <div className="loading">No scheduledscalings found. Create one to get started!</div>
        ) : (
          <div className="table-container">
            <table className="scheduledscalings-table">
              <thead>
                <tr>
                  <th className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedScheduledScalings.size === scheduledScalings.length && scheduledScalings.length > 0}
                      onChange={toggleAllScheduledScalings}
                    />
                  </th>
                  <th className="sortable" onClick={() => handleSort('name')}>
                    Name <SortIndicator columnKey="name" />
                  </th>
                  <th className="sortable" onClick={() => handleSort('target')}>
                    Target <SortIndicator columnKey="target" />
                  </th>
                  <th className="sortable" onClick={() => handleSort('schedule')}>
                    Schedule <SortIndicator columnKey="schedule" />
                  </th>
                  <th className="sortable" onClick={() => handleSort('end')}>
                    End/Duration <SortIndicator columnKey="end" />
                  </th>
                  <th className="sortable" onClick={() => handleSort('replicas')}>
                    Min/Max Replicas <SortIndicator columnKey="replicas" />
                  </th>
                  <th className="sortable" onClick={() => handleSort('status')}>
                    Status <SortIndicator columnKey="status" />
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getSortedScheduledScalings().map((ss) => (
                <tr key={ss.metadata.uid}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedScheduledScalings.has(ss.metadata.uid)}
                      onChange={() => toggleScheduledScalingSelection(ss.metadata.uid)}
                    />
                  </td>
                  <td>{ss.metadata.name}</td>
                  <td>
                    {ss.spec.targetRef.kind}/{ss.spec.targetRef.name}
                  </td>
                  <td>
                    {ss.spec.schedule.recurrence ? (
                      <div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {ss.spec.schedule.recurrence.schedule}
                        </div>
                        {ss.spec.schedule.recurrence.timezone && (
                          <small style={{ color: '#666' }}>TZ: {ss.spec.schedule.recurrence.timezone}</small>
                        )}
                      </div>
                    ) : (
                      ss.spec.schedule.startTime
                        ? format(new Date(ss.spec.schedule.startTime), 'PPpp')
                        : '-'
                    )}
                  </td>
                  <td>
                    {ss.spec.schedule.recurrence ? (
                      <div>
                        <span style={{ fontWeight: 'bold' }}>{ss.spec.schedule.recurrence.duration}</span>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>per occurrence</div>
                      </div>
                    ) : (
                      ss.spec.schedule.endTime
                        ? format(new Date(ss.spec.schedule.endTime), 'PPpp')
                        : '-'
                    )}
                  </td>
                  <td>
                    {ss.spec.scaling.minReplicas || '-'} / {ss.spec.scaling.maxReplicas || '-'}
                  </td>
                  <td>{getStatusBadge(ss.status?.phase)}</td>
                  <td>
                    <div className="actions">
                      {ss.status?.phase !== 'Completed' && ss.status?.phase !== 'Cancelled' && ss.status?.phase !== 'Recurring' && (
                        <>
                          <button
                            className="btn btn-secondary btn-small"
                            onClick={() => handleEdit(ss)}
                          >
                            Edit
                          </button>
                          {ss.status?.phase === 'Active' && (
                            <button
                              className="btn btn-warning btn-small"
                              onClick={() => handleRevert(ss)}
                            >
                              Revert
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-small"
                            onClick={() => handleCancel(ss)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {ss.status?.phase === 'Recurring' && (
                        <span style={{ color: '#666', fontSize: '12px' }}>Managed by CronJob</span>
                      )}
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => handleDelete(ss)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
