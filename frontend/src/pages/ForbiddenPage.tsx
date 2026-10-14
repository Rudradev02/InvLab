import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

export const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#FBFBF9] flex items-center justify-center p-6">
      <Card className="max-w-md w-full border border-[#E3E1DA] bg-white shadow-xs p-2">
        <CardContent className="pt-8 pb-6 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-[#FBE9E7] text-[#B3261E] flex items-center justify-center mx-auto mb-5 border border-[#ffcdd2]">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold text-[#202521] tracking-tight mb-2">
            Access Restricted (403)
          </h1>

          <p className="text-sm text-[#5E6B63] leading-relaxed mb-6">
            You do not have permission to view this resource. Access is strictly scoped to your assigned role and warehouse.
          </p>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-2 border-[#E3E1DA] text-[#202521]"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/')}
              className="bg-[#173D32] hover:bg-[#123027] text-white"
            >
              Return to Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
