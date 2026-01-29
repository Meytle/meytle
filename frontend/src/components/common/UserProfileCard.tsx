/**
 * UserProfileCard Component
 * Displays user profile information in a card format
 */

import type { User } from '../../types';

interface UserProfileCardProps {
  user: User;
  title?: string;
}

const UserProfileCard = ({ user, title = 'Your Profile' }: UserProfileCardProps) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <div className="space-y-2">
        <p>
          <strong>Name:</strong> {user.name}
        </p>
        <p>
          <strong>Email:</strong> {user.email}
        </p>
        <p>
          <strong>Role:</strong>{' '}
          <span className="capitalize">{user.activeRole}</span>
        </p>
      </div>
    </div>
  );
};

export default UserProfileCard;
