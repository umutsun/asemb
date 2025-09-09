const joi = require('joi');
const { validationResult } = require('express-validator');

const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        errors
      });
    }
    
    next();
  };
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors.array()
    });
  }
  
  next();
};

const schemas = {
  login: joi.object({
    email: joi.string().email().required(),
    password: joi.string().min(6).required()
  }),
  
  createTask: joi.object({
    title: joi.string().min(3).max(200).required(),
    description: joi.string().max(1000),
    priority: joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    assignedTo: joi.string(),
    dueDate: joi.date().iso()
  }),
  
  updateConfig: joi.object({
    key: joi.string().required(),
    value: joi.any().required(),
    scope: joi.string().valid('global', 'agent', 'workflow').default('global')
  }),
  
  search: joi.object({
    query: joi.string().min(1).max(500).required(),
    limit: joi.number().integer().min(1).max(100).default(10),
    threshold: joi.number().min(0).max(1).default(0.7),
    filters: joi.object({
      type: joi.string(),
      dateRange: joi.object({
        from: joi.date().iso(),
        to: joi.date().iso()
      })
    })
  }),
  
  document: joi.object({
    title: joi.string().min(1).max(500).required(),
    content: joi.string().min(1).required(),
    metadata: joi.object(),
    tags: joi.array().items(joi.string())
  }),
  
  workflow: joi.object({
    name: joi.string().min(3).max(200).required(),
    type: joi.string().valid('search', 'embedding', 'rag', 'custom').required(),
    config: joi.object(),
    active: joi.boolean().default(false)
  })
};

const validateLogin = validateRequest(schemas.login);
const validateTask = validateRequest(schemas.createTask);
const validateConfig = validateRequest(schemas.updateConfig);
const validateSearch = validateRequest(schemas.search);
const validateDocument = validateRequest(schemas.document);
const validateWorkflow = validateRequest(schemas.workflow);

module.exports = {
  validateRequest,
  handleValidationErrors,
  schemas,
  validateLogin,
  validateTask,
  validateConfig,
  validateSearch,
  validateDocument,
  validateWorkflow
};