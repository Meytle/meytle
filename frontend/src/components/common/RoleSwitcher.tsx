import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { UserRole } from '../../types';
import Button from './Button';
import Card from './Card';
import { FaUser, FaUserTie, FaUserShield, FaChevronDown } from 'react-icons/fa';

interface RoleSwitcherProps {
  className?: string;
}

const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ className = '' }) => {
  const { user, switchRole, hasRole, isLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  if (!user || !user.roles || user.roles.length <= 1) {
    return null;
  }

  const roleIcons = {
    client: FaUser,
    companion: FaUserTie,
    admin: FaUserShield,
  };

  const roleLabels = {
    client: 'Client',
    companion: 'Companion',
    admin: 'Admin',
  };

  const availableRoles = user.roles.filter(role => role !== user.activeRole);

  const handleRoleSwitch = async (role: UserRole) => {
    try {
      await switchRole(role);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch role:', error);
    }
  };

  const currentRole = user.activeRole || user.role as UserRole;
  const CurrentRoleIcon = roleIcons[currentRole];

  return (
    <div className={`relative ${className}`}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2"
        disabled={isLoading}
      >
        <CurrentRoleIcon className="w-4 h-4" />
        <span>{roleLabels[currentRole]}</span>
        <FaChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-10" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-20 w-48">
            <Card className="p-2 shadow-xl">
              <div className="space-y-1">
                {availableRoles.map((role) => {
                  const RoleIcon = roleIcons[role];
                  return (
                    <button
                      key={role}
                      onClick={() => handleRoleSwitch(role)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#f0effe] rounded-lg transition-colors"
                    >
                      <RoleIcon className="w-4 h-4 text-[#312E81]" />
                      <span className="text-sm font-medium">{roleLabels[role]}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default RoleSwitcher;
