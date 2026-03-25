import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface TwoFAProps {
  onBack?: () => void;
}

export function TwoFA({ onBack }: TwoFAProps) {
  const [code, setCode] = useState("");

  return (
    <div className="space-y-3">
      <Input
        placeholder="Enter 2FA code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
      />
      <Button className="w-full" disabled={code.trim().length < 6}>
        Verify
      </Button>
      {onBack && (
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  );
}
