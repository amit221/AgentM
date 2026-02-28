/**
 * Minimal field/parameter validation utilities for backend AI routes
 */

export type ParameterDescriptor = {
  name: string;
  field: string;
  description?: string;
  isEnum?: boolean;
};

export type ParameterToValidate = {
  paramName: string;
  field: string;
  description?: string;
  isEnum: true;
  needsValidation: true;
};

export default class FieldValueValidator {
  /**
   * Detect which parameters should be validated/fetched from DB.
   * Rules: only parameters explicitly marked as enum-capable (isEnum === true)
   */
  static detectParametersForValidation(
    parameters: unknown,
    _collectionSchemas: Record<string, any> | null | undefined
  ): ParameterToValidate[] {
    try {
      const parametersToValidate: ParameterToValidate[] = [];
      if (!Array.isArray(parameters)) return [];

      for (const param of parameters as ParameterDescriptor[]) {
        if (!param) continue;
        const hasBasicShape = typeof param.name === 'string' && typeof param.field === 'string';
        if (!hasBasicShape) continue;
        if (param.isEnum === true) {
          parametersToValidate.push({
            paramName: param.name,
            field: param.field,
            description: param.description || '',
            isEnum: true,
            needsValidation: true
          });
        }
      }
      return parametersToValidate;
    } catch (err) {
      return [];
    }
  }
}


