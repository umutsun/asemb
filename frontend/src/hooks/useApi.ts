import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { AxiosResponse } from 'axios';
import apiClient from '@/lib/api/client';
import { invalidateQueries } from '@/lib/query/queryClient';

interface UseApiQueryOptions<T> extends Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'> {
  invalidateOnSuccess?: string[];
}

interface UseApiMutationOptions<TData, TVariables> 
  extends Omit<UseMutationOptions<TData, Error, TVariables>, 'mutationFn'> {
  invalidateOnSuccess?: string[];
  successMessage?: string;
  errorMessage?: string;
}

// Generic GET query hook
export function useApiQuery<T = any>(
  key: string | string[],
  url: string,
  options?: UseApiQueryOptions<T>
) {
  const queryKey = Array.isArray(key) ? key : [key];
  
  return useQuery<T>({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.get<T>(url);
      return response.data;
    },
    ...options,
  });
}

// Generic POST mutation hook
export function useApiPost<TData = any, TVariables = any>(
  url: string,
  options?: UseApiMutationOptions<TData, TVariables>
) {
  const { invalidateOnSuccess, successMessage, errorMessage, ...mutationOptions } = options || {};
  
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const response = await apiClient.post<TData>(url, variables);
      return response.data;
    },
    onSuccess: (data, variables, context) => {
      if (invalidateOnSuccess) {
        invalidateQueries(invalidateOnSuccess);
      }
      
      if (successMessage) {
        // Show success notification
        console.log(successMessage);
      }
      
      options?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      if (errorMessage) {
        // Show error notification
        console.error(errorMessage);
      }
      
      options?.onError?.(error, variables, context);
    },
    ...mutationOptions,
  });
}

// Generic PUT mutation hook
export function useApiPut<TData = any, TVariables = any>(
  url: string,
  options?: UseApiMutationOptions<TData, TVariables>
) {
  const { invalidateOnSuccess, ...mutationOptions } = options || {};
  
  return useMutation<TData, Error, TVariables>({
    mutationFn: async (variables: TVariables) => {
      const response = await apiClient.put<TData>(url, variables);
      return response.data;
    },
    onSuccess: (data, variables, context) => {
      if (invalidateOnSuccess) {
        invalidateQueries(invalidateOnSuccess);
      }
      options?.onSuccess?.(data, variables, context);
    },
    ...mutationOptions,
  });
}

// Generic DELETE mutation hook
export function useApiDelete<TData = any>(
  url: string,
  options?: UseApiMutationOptions<TData, void>
) {
  const { invalidateOnSuccess, ...mutationOptions } = options || {};
  
  return useMutation<TData, Error, void>({
    mutationFn: async () => {
      const response = await apiClient.delete<TData>(url);
      return response.data;
    },
    onSuccess: (data, variables, context) => {
      if (invalidateOnSuccess) {
        invalidateQueries(invalidateOnSuccess);
      }
      options?.onSuccess?.(data, variables, context);
    },
    ...mutationOptions,
  });
}

// Paginated query hook
export function usePaginatedQuery<T = any>(
  key: string,
  url: string,
  page: number,
  limit: number = 10,
  options?: UseQueryOptions<T>
) {
  return useQuery<T>({
    queryKey: [key, page, limit],
    queryFn: async () => {
      const response = await apiClient.get<T>(url, {
        params: { page, limit }
      });
      return response.data;
    },
    ...options,
  });
}

// Infinite query hook for infinite scrolling
export function useInfiniteApiQuery<T = any>(
  key: string,
  url: string,
  limit: number = 10
) {
  return useQuery<T[]>({
    queryKey: [key, 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await apiClient.get<T[]>(url, {
        params: { 
          offset: pageParam,
          limit 
        }
      });
      return response.data;
    },
  });
}