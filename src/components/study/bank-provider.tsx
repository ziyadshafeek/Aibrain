import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { loadBankIndex } from "@/lib/bank";
import type { BankIndex } from "@/lib/bank";

type BankCtx = {
  idx: BankIndex | null;
  error: string | null;
};

const Ctx = createContext<BankCtx>({ idx: null, error: null });

export function BankProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BankCtx>({ idx: null, error: null });

  useEffect(() => {
    let alive = true;
    loadBankIndex()
      .then((idx) => alive && setState({ idx, error: null }))
      .catch((err) => alive && setState({ idx: null, error: String(err?.message ?? err) }));
    return () => {
      alive = false;
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useBank(): BankCtx {
  return useContext(Ctx);
}

/** Hook that suspends-free waits for the bank and returns the index. */
export function useBankIndex(): BankIndex | null {
  return useContext(Ctx).idx;
}
