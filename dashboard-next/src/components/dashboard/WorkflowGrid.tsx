import React from 'react';

const WorkflowGrid = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Workflow 1</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Description of workflow 1.</p>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Workflow 2</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Description of workflow 2.</p>
      </div>
      <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Workflow 3</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Description of workflow 3.</p>
      </div>
    </div>
  );
};

export default WorkflowGrid;
