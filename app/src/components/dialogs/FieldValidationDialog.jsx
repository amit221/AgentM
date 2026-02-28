import React, { useState, useEffect } from 'react';

const FieldValidationDialog = ({ 
  isOpen, 
  onClose, 
  suspiciousFields, 
  onUseActualValues, 
  onSupplyManually, 
  onIgnore,
  isLoading = false 
}) => {
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [manualValues, setManualValues] = useState({});

  useEffect(() => {
    if (isOpen) {
      // Select all fields by default
      setSelectedFields(new Set(suspiciousFields.map(field => field.field)));
      setManualValues({});
    }
  }, [isOpen, suspiciousFields]);

  const handleFieldToggle = (fieldName) => {
    const newSelected = new Set(selectedFields);
    if (newSelected.has(fieldName)) {
      newSelected.delete(fieldName);
    } else {
      newSelected.add(fieldName);
    }
    setSelectedFields(newSelected);
  };

  const handleManualValueChange = (fieldName, value) => {
    setManualValues(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleUseActualValues = () => {
    const fieldsToValidate = suspiciousFields.filter(field => 
      selectedFields.has(field.field)
    );
    onUseActualValues(fieldsToValidate);
  };

  const handleSupplyManually = () => {
    const fieldsWithValues = suspiciousFields.filter(field => 
      selectedFields.has(field.field)
    ).map(field => ({
      ...field,
      newValue: manualValues[field.field] || field.value
    }));
    onSupplyManually(fieldsWithValues);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          🔍 String Field Values Detected
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          The query contains string values that could be validated against actual database data:
        </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto max-h-96">
                  {suspiciousFields.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400">No string field values detected.</p>
        ) : (
          <div className="space-y-4">
            {suspiciousFields.map((field, index) => (
              <div 
                key={index}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id={`field-${index}`}
                    checked={selectedFields.has(field.field)}
                    onChange={() => handleFieldToggle(field.field)}
                    className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <div className="flex-1">
                    <label 
                      htmlFor={`field-${index}`}
                      className="block font-medium text-gray-900 dark:text-gray-100 cursor-pointer"
                    >
                      Field: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-sm">
                        {field.field}
                      </code>
                    </label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Current value: <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">
                        "{field.value}"
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Not cached - can fetch actual database values
                    </p>
                      
                      {/* Manual value input */}
                      {selectedFields.has(field.field) && (
                        <div className="mt-3">
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Or provide your own value:
                          </label>
                          <input
                            type="text"
                            value={manualValues[field.field] || ''}
                            onChange={(e) => handleManualValueChange(field.field, e.target.value)}
                            placeholder={`Enter value for ${field.field}...`}
                            className="input text-sm w-full"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex flex-col sm:flex-row sm:justify-between space-y-2 sm:space-y-0 sm:space-x-3">
            <div className="flex space-x-2">
              <button
                onClick={handleUseActualValues}
                disabled={selectedFields.size === 0 || isLoading}
                className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>🔍 Fetch Actual Values</span>
              </button>
              
              <button
                onClick={handleSupplyManually}
                disabled={selectedFields.size === 0}
                className="btn btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✏️ Use Manual Values
              </button>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={onIgnore}
                className="btn btn-ghost"
              >
                ⚠️ Ignore & Proceed
              </button>
              
              <button
                onClick={onClose}
                className="btn btn-ghost"
              >
                Cancel
              </button>
            </div>
          </div>
          
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            <strong>Options:</strong>
            <ul className="mt-1 space-y-1">
              <li>• <strong>Fetch Actual Values:</strong> Query the database for real field values and regenerate the query</li>
              <li>• <strong>Use Manual Values:</strong> Replace with your specified values</li>
              <li>• <strong>Ignore & Proceed:</strong> Execute the query as-is</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FieldValidationDialog;