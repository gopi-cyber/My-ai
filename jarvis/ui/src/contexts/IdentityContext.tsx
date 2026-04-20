import React, { createContext, useContext, useState, useEffect } from "react";

export type Identity = {
  name: string;
  wakeWord: string;
};

type IdentityContextType = {
  identity: Identity;
  name: string;
  wakeWord: string;
  updateIdentity: (newIdentity: Partial<{ assistant_name: string; wake_word: string }>) => Promise<void>;
  loading: boolean;
};

const IdentityContext = createContext<IdentityContextType | undefined>(undefined);

export function IdentityProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity>({ name: "AETHER", wakeWord: "hey aether" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIdentity() {
      try {
        const response = await fetch("/api/personality");
        const data = await response.json();
        setIdentity({
          name: data.assistant_name || "AETHER",
          wakeWord: data.wake_word || "hey aether",
        });
      } catch (err) {
        console.error("Failed to fetch identity:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchIdentity();
  }, []);

  const updateIdentity = async (newIdentity: Partial<{ assistant_name: string; wake_word: string }>) => {
    try {
      const response = await fetch("/api/personality", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newIdentity),
      });

      if (!response.ok) throw new Error("Failed to update identity");

      const data = await response.json();
      setIdentity({
        name: data.assistant_name || identity.name,
        wakeWord: data.wake_word || identity.wakeWord,
      });
    } catch (err) {
      console.error("Error updating identity:", err);
      throw err;
    }
  };

  return (
    <IdentityContext.Provider value={{
      identity,
      name: identity.name,
      wakeWord: identity.wakeWord,
      updateIdentity,
      loading
    }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const context = useContext(IdentityContext);
  if (context === undefined) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return context;
}
