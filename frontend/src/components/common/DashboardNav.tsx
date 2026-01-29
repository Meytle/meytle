/**
 * DashboardNav Component
 * Reusable navigation bar for dashboard pages
 */

interface DashboardNavProps {
  title: string;
  userName: string;
  onSignOut: () => void;
}

const DashboardNav = ({ title, userName, onSignOut }: DashboardNavProps) => {
  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">Welcome, {userName}</span>
            <button
              onClick={onSignOut}
              className="bg-[#312E81] hover:bg-[#1E1B4B] text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              aria-label="Sign out"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default DashboardNav;

