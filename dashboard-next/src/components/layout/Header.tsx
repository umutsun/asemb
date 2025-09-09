import React from 'react';
import SearchBar from '../dashboard/SearchBar';

const Header = () => {
  return (
    <header className="flex justify-between items-center py-4 px-6 bg-white dark:bg-gray-800 border-b-2 border-gray-200 dark:border-gray-700">
      <div className="flex items-center">
        <div className="relative">
          <SearchBar />
        </div>
      </div>
      <div className="flex items-center">
        <button className="flex mx-4 text-gray-600 dark:text-gray-200 focus:outline-none">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 17H20L18.5951 15.5951C18.2141 15.2141 18 14.6973 18 14.1585V11C18 8.38757 16.3304 6.16509 14 5.34142V5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5V5.34142C7.66962 6.16509 6 8.38757 6 11V14.1585C6 14.6973 5.78595 15.2141 5.40493 15.5951L4 17H9M12 21C12.5523 21 13 20.5523 13 20H11C11 20.5523 11.4477 21 12 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="relative">
          <button className="relative z-10 block h-8 w-8 rounded-full overflow-hidden shadow focus:outline-none">
            <img className="h-full w-full object-cover" src="https://via.placeholder.com/150" alt="Your avatar" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
