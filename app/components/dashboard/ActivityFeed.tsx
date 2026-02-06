"use client";

export interface Activity {
    id: string;
    type: 'scan' | 'approve' | 'reject' | 'add' | 'delete';
    siteName: string;
    siteUrl: string;
    timestamp: string;
    details?: string;
}

interface ActivityFeedProps {
    activities: Activity[];
}

export default function ActivityFeed({ activities }: ActivityFeedProps) {
    const getRelativeTime = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return `${Math.floor(diffDays / 7)}w ago`;
    };

    const getActivityIcon = (type: Activity['type']) => {
        switch (type) {
            case 'scan':
                return (
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                );
            case 'approve':
                return (
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                );
            case 'reject':
                return (
                    <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                );
            case 'add':
                return (
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </div>
                );
            case 'delete':
                return (
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                );
        }
    };

    const getActivityText = (activity: Activity) => {
        switch (activity.type) {
            case 'scan':
                return (
                    <>
                        <span className="font-medium text-gray-900">Scanned</span> {activity.siteName}
                        {activity.details && <span className="text-gray-500"> • {activity.details}</span>}
                    </>
                );
            case 'approve':
                return (
                    <>
                        <span className="font-medium text-gray-900">Approved redirect</span> on {activity.siteName}
                    </>
                );
            case 'reject':
                return (
                    <>
                        <span className="font-medium text-gray-900">Rejected redirect</span> on {activity.siteName}
                    </>
                );
            case 'add':
                return (
                    <>
                        <span className="font-medium text-gray-900">Added site</span> {activity.siteName}
                    </>
                );
            case 'delete':
                return (
                    <>
                        <span className="font-medium text-gray-900">Deleted site</span> {activity.siteName}
                    </>
                );
        }
    };

    return (
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Recent Activity</h3>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>

            {activities.length === 0 ? (
                <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <p className="text-sm text-gray-500">No recent activity</p>
                </div>
            ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto overflow-x-hidden">
                    {activities.map((activity) => (
                        <div key={activity.id} className="flex items-start gap-3 group hover:bg-gray-50 p-2 rounded-lg transition-colors">
                            {getActivityIcon(activity.type)}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-600">
                                    {getActivityText(activity)}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {getRelativeTime(activity.timestamp)}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
