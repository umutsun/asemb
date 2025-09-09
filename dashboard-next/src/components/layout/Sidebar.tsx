import React from 'react';

const Sidebar = () => {
  return (
    <div className="w-64 bg-white dark:bg-gray-800 shadow-md">
      <div className="p-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Dashboard</h1>
      </div>
      <nav className="mt-5">
        <a href="#" className="flex items-center mt-4 py-2 px-6 text-gray-700 dark:text-gray-200 bg-gray-200 dark:bg-gray-700">
          <span className="mx-4 font-medium">Home</span>
        </a>
        <a href="#" className="flex items-center mt-4 py-2 px-6 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">
          <span className="mx-4 font-medium">Workflows</span>
        </a>
        <a href="#" className="flex items-center mt-4 py-2 px-6 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">
          <span className="mx-4 font-medium">Settings</span>
        </a>
      </nav>
    </div>
  );
};

export default Sidebar;
