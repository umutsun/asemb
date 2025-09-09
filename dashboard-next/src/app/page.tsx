import SystemStatus from "@/components/SystemStatus";
import SemanticSearch from "@/components/SemanticSearch";
import Link from "next/link";

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800 dark:text-white">
          Alice Semantic Bridge
        </h1>
        <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
          AI-Powered Semantic Search & Knowledge Management System
        </p>
      </div>

      {/* System Status */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-4">
          System Status
        </h2>
        <SystemStatus />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Link href="/search" className="block">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white hover:shadow-xl transition-shadow cursor-pointer">
            <h3 className="text-xl font-semibold mb-2">Semantic Search</h3>
            <p className="opacity-90">Search through your knowledge base using AI-powered semantic understanding</p>
          </div>
        </Link>
        
        <Link href="/workflows" className="block">
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white hover:shadow-xl transition-shadow cursor-pointer">
            <h3 className="text-xl font-semibold mb-2">Workflow Management</h3>
            <p className="opacity-90">Monitor and manage your n8n workflows and data pipelines</p>
          </div>
        </Link>
      </div>

      {/* Semantic Search Component */}
      <div className="mb-8">
        <SemanticSearch />
      </div>
    </div>
  );
}
