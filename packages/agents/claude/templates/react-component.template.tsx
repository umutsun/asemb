'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// Type definitions
interface {{ComponentName}}Props {
  className?: string;
  initialData?: any;
  onSubmit?: (data: any) => void | Promise<void>;
  onCancel?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface {{ComponentName}}State {
  data: any;
  errors: Record<string, string>;
  isSubmitting: boolean;
}

/**
 * {{ComponentName}} Component
 * 
 * {{Description}}
 * 
 * @example
 * ```tsx
 * <{{ComponentName}}
 *   initialData={data}
 *   onSubmit={handleSubmit}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export function {{ComponentName}}({
  className,
  initialData,
  onSubmit,
  onCancel,
  loading = false,
  disabled = false,
}: {{ComponentName}}Props) {
  const router = useRouter();
  
  // State management
  const [state, setState] = useState<{{ComponentName}}State>({
    data: initialData || {},
    errors: {},
    isSubmitting: false,
  });

  // Handlers
  const handleInputChange = useCallback((field: string, value: any) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [field]: value,
      },
      errors: {
        ...prev.errors,
        [field]: '', // Clear error when field changes
      },
    }));
  }, []);

  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    
    // Add validation logic here
    if (!state.data.requiredField) {
      errors.requiredField = 'This field is required';
    }
    
    setState(prev => ({ ...prev, errors }));
    return Object.keys(errors).length === 0;
  }, [state.data]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }
    
    setState(prev => ({ ...prev, isSubmitting: true }));
    
    try {
      await onSubmit?.(state.data);
      // Reset form after successful submission
      setState({
        data: {},
        errors: {},
        isSubmitting: false,
      });
    } catch (error) {
      console.error('Submit error:', error);
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        errors: {
          ...prev.errors,
          submit: error instanceof Error ? error.message : 'An error occurred',
        },
      }));
    }
  }, [state.data, validate, onSubmit]);

  const handleCancel = useCallback(() => {
    onCancel?.();
    router.back();
  }, [onCancel, router]);

  // Computed values
  const isDisabled = useMemo(() => {
    return disabled || loading || state.isSubmitting;
  }, [disabled, loading, state.isSubmitting]);

  // Effects
  useEffect(() => {
    if (initialData) {
      setState(prev => ({
        ...prev,
        data: initialData,
      }));
    }
  }, [initialData]);

  // Render
  return (
    <div className={cn('{{component-name}}', className)}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Form fields */}
        <div className="form-group">
          <label htmlFor="field1" className="block text-sm font-medium">
            Field Label
          </label>
          <input
            id="field1"
            type="text"
            value={state.data.field1 || ''}
            onChange={(e) => handleInputChange('field1', e.target.value)}
            disabled={isDisabled}
            className={cn(
              'mt-1 block w-full rounded-md border-gray-300',
              state.errors.field1 && 'border-red-500'
            )}
          />
          {state.errors.field1 && (
            <p className="mt-1 text-sm text-red-600">{state.errors.field1}</p>
          )}
        </div>

        {/* Submit error */}
        {state.errors.submit && (
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{state.errors.submit}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={state.isSubmitting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isDisabled}
            className={cn(
              'px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md',
              isDisabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-blue-700'
            )}
          >
            {state.isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Default export
export default {{ComponentName}};