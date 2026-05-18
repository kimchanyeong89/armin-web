import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { calculateUnitPrice } from "../features/cart/productCatalog";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";

export type CartSizeOption = {
  id: string;
  name: string;
  multiplier: number;
};

export type CartItem = {
  id: string;
  artworkId: string;
  artworkName: string;
  artist: string;
  year?: number;
  image: string;
  dimension?: string;
  selectedType: string;
  selectedSizeId: string;
  quantity: number;
  sizeOptions: CartSizeOption[];
  createdAt: number;
};

type AddCartItemInput = Omit<CartItem, "id" | "createdAt">;

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (input: AddCartItemInput) => void;
  updateItem: (id: string, patch: Partial<CartItem>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  getItemTotalPrice: (item: CartItem) => number;
};

// Legacy single-key store (pre user-scoped). Kept for one-time migration.
const LEGACY_CART_STORAGE_KEY = "armin:cart:v1";
// Per-user (or anonymous) localStorage namespace. Acts as offline cache and
// the canonical store for users who are not signed in. Items here are merged
// up to Firestore the first time the user signs in.
const cartStorageKeyFor = (uid: string | null | undefined) =>
  `armin:cart:v2:${uid || "anon"}`;

const CartContext = createContext<CartContextValue | null>(null);

function normalizeQuantity(value: number): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(99, parsed));
}

function normalizeSizeOptions(options: CartSizeOption[]): CartSizeOption[] {
  if (!Array.isArray(options) || options.length === 0) {
    return [{ id: "M", name: "M", multiplier: 1.5 }];
  }
  return options
    .filter((option) => option && option.id && option.name)
    .map((option) => ({
      id: String(option.id),
      name: String(option.name),
      multiplier: Number(option.multiplier) || 1,
    }));
}

function normalizeCartItem(item: any): CartItem | null {
  if (!item || !item.id || !item.artworkId) return null;
  return {
    id: String(item.id),
    artworkId: String(item.artworkId),
    artworkName: String(item.artworkName ?? ""),
    artist: String(item.artist ?? ""),
    year: typeof item.year === "number" ? item.year : undefined,
    image: String(item.image ?? ""),
    dimension: item.dimension ? String(item.dimension) : undefined,
    selectedType: String(item.selectedType ?? ""),
    selectedSizeId: String(item.selectedSizeId ?? ""),
    quantity: normalizeQuantity(item.quantity),
    sizeOptions: normalizeSizeOptions(item.sizeOptions),
    createdAt: Number(item.createdAt) || Date.now(),
  };
}

function readLocal(uid: string | null | undefined): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cartStorageKeyFor(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCartItem).filter((x): x is CartItem => !!x);
  } catch {
    return [];
  }
}

function readLegacyLocal(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCartItem).filter((x): x is CartItem => !!x);
  } catch {
    return [];
  }
}

function writeLocal(uid: string | null | undefined, items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(cartStorageKeyFor(uid), JSON.stringify(items));
  } catch {
    // ignore storage failure
  }
}

function compositeKey(item: { artworkId: string; selectedType: string; selectedSizeId: string }) {
  return `${item.artworkId}__${item.selectedType}__${item.selectedSizeId}`;
}

// Merge two lists, preferring the higher quantity and most recent createdAt.
// Items with the same composite key are deduplicated.
function mergeCartItems(a: CartItem[], b: CartItem[]): CartItem[] {
  const byKey = new Map<string, CartItem>();
  const push = (item: CartItem) => {
    const key = compositeKey(item);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      return;
    }
    byKey.set(key, {
      ...existing,
      // Prefer the larger quantity so items never silently shrink.
      quantity: normalizeQuantity(Math.max(existing.quantity, item.quantity)),
      sizeOptions: normalizeSizeOptions(item.sizeOptions || existing.sizeOptions),
      createdAt: Math.min(existing.createdAt, item.createdAt),
      // Keep the first id we saw so Firestore docId stays stable.
      id: existing.id,
    });
  };
  for (const item of a) push(item);
  for (const item of b) push(item);
  return Array.from(byKey.values()).sort((x, y) => y.createdAt - x.createdAt);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  // Whether we've performed initial Firestore -> local hydrate for this uid.
  const hydratedForUidRef = useRef<string | null>(null);
  // Latest items, kept in a ref so async writers (Firestore) can read it
  // without re-subscribing.
  const itemsRef = useRef<CartItem[]>([]);
  // True while applying a remote snapshot, so we don't echo writes back up.
  const applyingRemoteRef = useRef(false);

  const [items, setItems] = useState<CartItem[]>(() => {
    // Best-effort initial value: anon localStorage + legacy migration. The
    // useEffect below will reconcile against Firestore once auth resolves.
    if (typeof window === "undefined") return [];
    const anon = readLocal(null);
    const legacy = readLegacyLocal();
    if (legacy.length) {
      try {
        localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    return mergeCartItems(anon, legacy);
  });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Mirror items to per-user localStorage cache on every change.
  useEffect(() => {
    writeLocal(uid, items);
  }, [uid, items]);

  // Subscribe to Firestore for the signed-in user. Merges any pending local
  // (anonymous or stale) items up on first hydrate so signing in never loses
  // what was already in the cart.
  useEffect(() => {
    if (!uid) {
      hydratedForUidRef.current = null;
      // When signed out, fall back to the anon localStorage cache. We do NOT
      // wipe the cart here — items must persist until explicit removal.
      const anon = readLocal(null);
      if (anon.length) {
        applyingRemoteRef.current = true;
        setItems((prev) => mergeCartItems(prev, anon));
        applyingRemoteRef.current = false;
      }
      return;
    }

    let cancelled = false;
    const cartCol = collection(db, `users/${uid}/cart`);

    const unsubscribe = onSnapshot(
      cartCol,
      async (snap) => {
        if (cancelled) return;
        const remote: CartItem[] = [];
        snap.forEach((d) => {
          const norm = normalizeCartItem({ id: d.id, ...d.data() });
          if (norm) remote.push(norm);
        });

        if (hydratedForUidRef.current !== uid) {
          // First snapshot for this uid — merge whatever is locally pending
          // (anon cart + this uid's previous offline cache) up to Firestore.
          hydratedForUidRef.current = uid;
          const localPending = mergeCartItems(itemsRef.current, readLocal(uid));
          const merged = mergeCartItems(remote, localPending);

          applyingRemoteRef.current = true;
          setItems(merged);
          applyingRemoteRef.current = false;

          // Push any items that aren't yet in remote (or whose merged form
          // differs) back up to Firestore. Failure here is non-fatal — the
          // local cache still holds the items.
          const remoteIds = new Set(remote.map((r) => r.id));
          const toUpload = merged.filter((m) => {
            if (!remoteIds.has(m.id)) return true;
            const r = remote.find((x) => x.id === m.id);
            return !r || r.quantity !== m.quantity;
          });
          if (toUpload.length) {
            try {
              const batch = writeBatch(db);
              for (const item of toUpload) {
                batch.set(doc(db, `users/${uid}/cart/${item.id}`), {
                  artworkId: item.artworkId,
                  artworkName: item.artworkName,
                  artist: item.artist,
                  year: item.year ?? null,
                  image: item.image,
                  dimension: item.dimension ?? null,
                  selectedType: item.selectedType,
                  selectedSizeId: item.selectedSizeId,
                  quantity: item.quantity,
                  sizeOptions: item.sizeOptions,
                  createdAt: item.createdAt,
                });
              }
              await batch.commit();
            } catch (err) {
              console.warn("[cart] initial merge upload failed", err);
            }
          }
          // Clear the anon cache once we've successfully merged it up so it
          // doesn't keep re-merging on every sign-in.
          try {
            localStorage.removeItem(cartStorageKeyFor(null));
          } catch {
            // ignore
          }
          return;
        }

        // Steady-state: apply remote as the source of truth for this uid.
        applyingRemoteRef.current = true;
        setItems(remote.sort((a, b) => b.createdAt - a.createdAt));
        applyingRemoteRef.current = false;
      },
      (err) => {
        // Permission errors / offline — keep local cache, log once.
        console.warn("[cart] firestore subscription error", err);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid]);

  const writeItemRemote = useCallback(
    async (item: CartItem) => {
      if (!uid) return;
      try {
        await setDoc(
          doc(db, `users/${uid}/cart/${item.id}`),
          {
            artworkId: item.artworkId,
            artworkName: item.artworkName,
            artist: item.artist,
            year: item.year ?? null,
            image: item.image,
            dimension: item.dimension ?? null,
            selectedType: item.selectedType,
            selectedSizeId: item.selectedSizeId,
            quantity: item.quantity,
            sizeOptions: item.sizeOptions,
            createdAt: item.createdAt,
          },
          { merge: true },
        );
      } catch (err) {
        console.warn("[cart] write failed", err);
      }
    },
    [uid],
  );

  const deleteItemRemote = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await deleteDoc(doc(db, `users/${uid}/cart/${id}`));
      } catch (err) {
        console.warn("[cart] delete failed", err);
      }
    },
    [uid],
  );

  const addItem = useCallback(
    (input: AddCartItemInput) => {
      let writeTarget: CartItem | null = null;
      setItems((prev) => {
        const key = compositeKey(input);
        const existing = prev.find((item) => compositeKey(item) === key);

        if (existing) {
          const updated: CartItem = {
            ...existing,
            quantity: normalizeQuantity(existing.quantity + input.quantity),
            sizeOptions: normalizeSizeOptions(input.sizeOptions),
          };
          writeTarget = updated;
          return prev.map((item) => (item.id === existing.id ? updated : item));
        }

        const nextItem: CartItem = {
          ...input,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          quantity: normalizeQuantity(input.quantity),
          sizeOptions: normalizeSizeOptions(input.sizeOptions),
          createdAt: Date.now(),
        };
        writeTarget = nextItem;
        return [nextItem, ...prev];
      });
      if (writeTarget) writeItemRemote(writeTarget);
    },
    [writeItemRemote],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<CartItem>) => {
      let writeTarget: CartItem | null = null;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          const merged = { ...item, ...patch };
          const next: CartItem = {
            ...merged,
            quantity: normalizeQuantity(merged.quantity),
            sizeOptions: normalizeSizeOptions(merged.sizeOptions),
          };
          writeTarget = next;
          return next;
        }),
      );
      if (writeTarget) writeItemRemote(writeTarget);
    },
    [writeItemRemote],
  );

  const removeItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((item) => item.id !== id));
      deleteItemRemote(id);
    },
    [deleteItemRemote],
  );

  const clearCart = useCallback(() => {
    const snapshot = itemsRef.current;
    setItems([]);
    if (uid) {
      // Fire-and-forget delete of all current docs.
      (async () => {
        try {
          const batch = writeBatch(db);
          for (const item of snapshot) {
            batch.delete(doc(db, `users/${uid}/cart/${item.id}`));
          }
          await batch.commit();
        } catch (err) {
          console.warn("[cart] clear failed", err);
        }
      })();
    }
  }, [uid]);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0),
    [items],
  );

  const getItemTotalPrice = useCallback((item: CartItem) => {
    const size = item.sizeOptions.find((option) => option.id === item.selectedSizeId);
    const multiplier = size?.multiplier || 1;
    return calculateUnitPrice(item.selectedType, multiplier) * normalizeQuantity(item.quantity);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      getItemTotalPrice,
    }),
    [items, itemCount, addItem, updateItem, removeItem, clearCart, getItemTotalPrice],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
}
