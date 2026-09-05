import dynamic from "next/dynamic";

export const WalletStack = dynamic(() => import("../WalletStack"), {
  loading: () => null,
  ssr: false,
});

export const Charts = dynamic(() => import("../Charts"), {
  loading: () => null,
  ssr: false,
});