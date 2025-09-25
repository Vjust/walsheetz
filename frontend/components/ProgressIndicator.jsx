import React, { useState, useEffect } from 'react';
import { CheckCircle, Clock, AlertCircle, Loader, Zap } from 'lucide-react';

export function ProgressIndicator({
  steps = [],
  currentStep = 0,
  status = 'loading', // 'loading', 'success', 'error', 'warning'
  estimatedTime = null,
  showDetails = true,
  compact = false,
  onCancel = null
}) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStepIcon = (index, stepStatus) => {
    if (stepStatus === 'completed') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else if (stepStatus === 'current') {
      return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
    } else if (stepStatus === 'error') {
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    } else {
      return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStepStatus = (index) => {
    if (status === 'error' && index === currentStep) return 'error';
    if (index < currentStep) return 'completed';
    if (index === currentStep) return 'current';
    return 'pending';
  };

  const getOverallStatus = () => {
    switch (status) {
      case 'success':
        return { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50' };
      case 'error':
        return { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' };
      case 'warning':
        return { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-50' };
      default:
        return { icon: Loader, color: 'text-blue-500', bg: 'bg-blue-50' };
    }
  };

  const overallStatus = getOverallStatus();
  const StatusIcon = overallStatus.icon;

  if (compact) {
    return (
      <div className="progress-indicator-compact">
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-5 h-5 ${overallStatus.color} ${status === 'loading' ? 'animate-spin' : ''}`} />
          <div className="flex-1">
            <div className="progress-text">
              {steps[currentStep]?.title || 'Processing...'}
            </div>
            {estimatedTime && (
              <div className="progress-time">
                Est. {formatTime(estimatedTime - elapsedTime)} remaining
              </div>
            )}
          </div>
          {onCancel && status === 'loading' && (
            <button onClick={onCancel} className="cancel-btn">Cancel</button>
          )}
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`progress-indicator ${overallStatus.bg}`}>
      {/* Header */}
      <div className="progress-header">
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-6 h-6 ${overallStatus.color} ${status === 'loading' ? 'animate-spin' : ''}`} />
          <div>
            <h3 className="progress-title">
              {status === 'success' ? 'Complete!' :
               status === 'error' ? 'Error Occurred' :
               steps[currentStep]?.title || 'Processing...'}
            </h3>
            {showDetails && (
              <p className="progress-subtitle">
                {status === 'success' ? 'Operation completed successfully' :
                 status === 'error' ? 'Something went wrong during the process' :
                 steps[currentStep]?.description || 'Please wait while we process your request'}
              </p>
            )}
          </div>
        </div>

        {/* Time and Cancel */}
        <div className="progress-meta">
          {status === 'loading' && (
            <div className="time-display">
              <Clock className="w-4 h-4" />
              <span>{formatTime(elapsedTime)}</span>
              {estimatedTime && (
                <span className="estimated">
                  / ~{formatTime(estimatedTime)}
                </span>
              )}
            </div>
          )}
          {onCancel && status === 'loading' && (
            <button onClick={onCancel} className="cancel-button">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="progress-bar-container">
        <div className="progress-bar">
          <div
            className={`progress-fill ${
              status === 'success' ? 'success' :
              status === 'error' ? 'error' : 'loading'
            }`}
            style={{
              width: status === 'success' ? '100%' :
                     status === 'error' ? `${(currentStep / steps.length) * 100}%` :
                     `${((currentStep + 0.5) / steps.length) * 100}%`
            }}
          />
        </div>
        <div className="progress-percentage">
          {Math.round(((currentStep + (status === 'success' ? 1 : 0.5)) / steps.length) * 100)}%
        </div>
      </div>

      {/* Steps */}
      {showDetails && steps.length > 0 && (
        <div className="steps-container">
          {steps.map((step, index) => {
            const stepStatus = getStepStatus(index);
            return (
              <div
                key={index}
                className={`step-item ${stepStatus}`}
              >
                <div className="step-icon">
                  {getStepIcon(index, stepStatus)}
                </div>
                <div className="step-content">
                  <div className="step-title">{step.title}</div>
                  {step.description && (
                    <div className="step-description">{step.description}</div>
                  )}
                  {stepStatus === 'current' && step.details && (
                    <div className="step-details">
                      <Zap className="w-3 h-3" />
                      {step.details}
                    </div>
                  )}
                </div>
                {stepStatus === 'completed' && step.duration && (
                  <div className="step-duration">
                    {formatTime(step.duration)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Error Details */}
      {status === 'error' && steps[currentStep]?.error && (
        <div className="error-details">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{steps[currentStep].error}</span>
        </div>
      )}
    </div>
  );
}

export default ProgressIndicator;