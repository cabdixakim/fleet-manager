import { useEffect, useState } from "react";

export function useCompanySettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  useEffect(() => {
    fetch("/api/company-settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setLoading(false);
      })
      .catch((e) => {
        setError("Failed to load company settings");
        setLoading(false);
      });
  }, []);

  return { settings, loading, error };
}
