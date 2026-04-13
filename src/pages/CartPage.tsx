import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import { ArrowLeft, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useCart } from "../contexts/CartContext";
import { PRODUCT_TYPES, formatPrice, getProductTypeById } from "../features/cart/productCatalog";
import { useLanguage } from "../contexts/LanguageContext";
import { getWeservUrl } from "../utils/imageProxy";

const PAYMENT_METHODS = [
  { id: "naverpay", name: "네이버페이", short: "N", color: "#03C75A" },
  { id: "kakaopay", name: "카카오페이", short: "K", color: "#FEE500" },
  { id: "tosspay", name: "토스페이", short: "T", color: "#0064FF" },
];

export default function CartPage() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { items, updateItem, removeItem, clearCart, getItemTotalPrice } = useCart();

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [isLightTheme, setIsLightTheme] = useState<boolean>(() => {
    try {
      return localStorage.getItem("homeTheme") === "light";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const syncTheme = () => {
      try {
        setIsLightTheme(localStorage.getItem("homeTheme") === "light");
      } catch {
        setIsLightTheme(false);
      }
    };

    window.addEventListener("theme-changed", syncTheme);
    window.addEventListener("storage", syncTheme);
    return () => {
      window.removeEventListener("theme-changed", syncTheme);
      window.removeEventListener("storage", syncTheme);
    };
  }, []);

  useEffect(() => {
    setSelectedItemIds((prev) => {
      const next = new Set<string>();
      items.forEach((item) => {
        if (prev.has(item.id)) next.add(item.id);
      });
      if (next.size === 0 && items.length > 0) {
        items.forEach((item) => next.add(item.id));
      }
      return next;
    });
  }, [items]);

  const selectedItems = useMemo(() => {
    return items.filter((item) => selectedItemIds.has(item.id));
  }, [items, selectedItemIds]);

  const selectedTotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + getItemTotalPrice(item), 0);
  }, [selectedItems, getItemTotalPrice]);

  const selectedCount = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [selectedItems]);

  const palette = isLightTheme
    ? {
        pageBg: "#f5f5f5",
        shellBg: "#fafafa",
        panelBg: "#ffffff",
        border: "rgba(0,0,0,0.09)",
        borderSoft: "rgba(0,0,0,0.06)",
        text: "#101010",
        textSub: "rgba(0,0,0,0.64)",
        textMute: "rgba(0,0,0,0.42)",
        chip: "rgba(0,0,0,0.04)",
        chipActive: "rgba(90,120,0,0.13)",
        accent: "#5A7800",
        accentBg: "#BFFF0A",
      }
    : {
        pageBg: "#050505",
        shellBg: "#0a0a0a",
        panelBg: "#111215",
        border: "rgba(255,255,255,0.12)",
        borderSoft: "rgba(255,255,255,0.08)",
        text: "rgba(255,255,255,0.92)",
        textSub: "rgba(255,255,255,0.68)",
        textMute: "rgba(255,255,255,0.45)",
        chip: "rgba(255,255,255,0.08)",
        chipActive: "rgba(191,255,10,0.16)",
        accent: "#C7FF3D",
        accentBg: "#C7FF3D",
      };

  const toggleSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === items.length) {
      setSelectedItemIds(new Set());
      return;
    }
    setSelectedItemIds(new Set(items.map((item) => item.id)));
  };

  const handleCheckout = async () => {
    if (selectedItems.length === 0) {
      alert(t({ ko: "구매할 상품을 선택해주세요.", en: "Select items to purchase." }));
      return;
    }
    if (!selectedPayment) {
      alert(t({ ko: "결제 수단을 선택해주세요.", en: "Select payment method." }));
      return;
    }

    try {
      const clientKey = import.meta.env.VITE_TOSS_CLIENT_KEY || "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
      const tossPayments = await loadTossPayments(clientKey);

      const orderId = `cart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const first = selectedItems[0];
      const orderName =
        selectedItems.length > 1
          ? `${first.artworkName} 외 ${selectedItems.length - 1}건`
          : `${first.artworkName} ${first.quantity}개`;

      let easyPayProvider = "";
      if (selectedPayment === "naverpay") easyPayProvider = "NAVERPAY";
      else if (selectedPayment === "kakaopay") easyPayProvider = "KAKAOPAY";
      else if (selectedPayment === "tosspay") easyPayProvider = "TOSSPAY";

      await tossPayments.requestPayment("카드", {
        amount: selectedTotal,
        orderId,
        orderName,
        successUrl: `${window.location.origin}/payment/success`,
        failUrl: `${window.location.origin}/payment/fail`,
        flowMode: "DIRECT",
        easyPay: easyPayProvider,
      } as any);
    } catch (error) {
      if ((error as any)?.code !== "USER_CANCEL") {
        alert(t({ ko: "결제 요청에 실패했습니다.", en: "Payment request failed." }));
      }
    }
  };

  return (
    <div style={{ width: "100%", height: "100%", overflowY: "auto", background: palette.pageBg }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "max(50px, calc(env(safe-area-inset-top) + 24px)) 14px 110px" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: isLightTheme ? "rgba(250,250,250,0.9)" : "rgba(10,10,10,0.88)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            paddingBottom: 12,
            borderBottom: `1px solid ${palette.borderSoft}`,
            marginBottom: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                cursor: "pointer",
                width: 36,
                height: 36,
                borderRadius: 999,
                border: `1px solid ${palette.border}`,
                background: palette.panelBg,
                color: palette.text,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: palette.textMute }}>Armin Print Lab</div>
              <div style={{ marginTop: 3, fontSize: "clamp(20px, 3.6vw, 30px)", color: palette.text, fontWeight: 700 }}>
                {t({ ko: "장바구니", en: "Cart" })}
              </div>
            </div>
            <button
              onClick={toggleSelectAll}
              style={{
                cursor: "pointer",
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                background: palette.chip,
                color: palette.textSub,
                padding: "7px 12px",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              {selectedItemIds.size === items.length && items.length > 0
                ? t({ ko: "전체 해제", en: "Clear all" })
                : t({ ko: "전체 선택", en: "Select all" })}
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${palette.border}`,
              borderRadius: 16,
              background: palette.shellBg,
              padding: "42px 20px",
              textAlign: "center",
              color: palette.textSub,
            }}
          >
            <ShoppingCart size={28} style={{ marginBottom: 10, opacity: 0.7 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: palette.text }}>{t({ ko: "장바구니가 비어있어요", en: "Your cart is empty" })}</div>
            <div style={{ marginTop: 6, fontSize: 12 }}>{t({ ko: "작품 상세에서 옵션을 고른 뒤 담아보세요.", en: "Add artworks from the product modal." })}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 10 }}>
            {items.map((item) => {
              const selected = selectedItemIds.has(item.id);
              const typeOption = getProductTypeById(item.selectedType);
              const selectedSize = item.sizeOptions.find((size) => size.id === item.selectedSizeId) || item.sizeOptions[0];
              const totalPrice = getItemTotalPrice(item);

              return (
                <section
                  key={item.id}
                  style={{
                    border: `1px solid ${selected ? palette.accent : palette.border}`,
                    borderRadius: 14,
                    background: palette.panelBg,
                    padding: 12,
                    display: "grid",
                    gridTemplateColumns: "auto minmax(0,1fr)",
                    gap: 12,
                  }}
                >
                  <button
                    onClick={() => toggleSelect(item.id)}
                    style={{
                      marginTop: 6,
                      cursor: "pointer",
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: `1px solid ${selected ? palette.accent : palette.border}`,
                      background: selected ? palette.accentBg : "transparent",
                      color: selected ? "#111" : "transparent",
                      fontWeight: 800,
                      fontSize: 12,
                      padding: 0,
                    }}
                  >
                    ✓
                  </button>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "86px minmax(0,1fr)", gap: 10 }}>
                      <div
                        style={{
                          width: 86,
                          height: 86,
                          borderRadius: 10,
                          overflow: "hidden",
                          background: palette.chip,
                          border: `1px solid ${palette.borderSoft}`,
                        }}
                      >
                        <img src={getWeservUrl(item.image, 360, 88)} alt={item.artworkName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: palette.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.artworkName}</div>
                            <div style={{ marginTop: 3, fontSize: 11, color: palette.textSub }}>{item.artist}{item.year ? ` · ${item.year}` : ""}</div>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            style={{
                              cursor: "pointer",
                              border: `1px solid ${palette.borderSoft}`,
                              background: palette.chip,
                              color: palette.textMute,
                              borderRadius: 8,
                              width: 30,
                              height: 30,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {PRODUCT_TYPES.map((type) => {
                            const active = type.id === item.selectedType;
                            return (
                              <button
                                key={type.id}
                                onClick={() => updateItem(item.id, { selectedType: type.id })}
                                style={{
                                  cursor: "pointer",
                                  border: `1px solid ${active ? palette.accent : palette.borderSoft}`,
                                  background: active ? palette.chipActive : palette.chip,
                                  color: active ? palette.text : palette.textSub,
                                  borderRadius: 999,
                                  padding: "5px 9px",
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                {type.name}
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: 7, display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {item.sizeOptions.map((sizeOption) => {
                            const active = sizeOption.id === item.selectedSizeId;
                            return (
                              <button
                                key={sizeOption.id}
                                onClick={() => updateItem(item.id, { selectedSizeId: sizeOption.id })}
                                style={{
                                  cursor: "pointer",
                                  border: `1px solid ${active ? palette.accent : palette.borderSoft}`,
                                  background: active ? palette.chipActive : "transparent",
                                  color: active ? palette.text : palette.textSub,
                                  borderRadius: 999,
                                  padding: "5px 9px",
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                {sizeOption.name}
                              </button>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <button
                              onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                              style={{
                                cursor: "pointer",
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                border: `1px solid ${palette.border}`,
                                background: palette.chip,
                                color: palette.text,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 0,
                              }}
                            >
                              <Minus size={13} strokeWidth={2.4} />
                            </button>
                            <div style={{ minWidth: 18, textAlign: "center", fontSize: 14, fontWeight: 700, color: palette.text }}>{item.quantity}</div>
                            <button
                              onClick={() => updateItem(item.id, { quantity: Math.min(99, item.quantity + 1) })}
                              style={{
                                cursor: "pointer",
                                width: 28,
                                height: 28,
                                borderRadius: 999,
                                border: `1px solid ${palette.border}`,
                                background: palette.chip,
                                color: palette.text,
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: 0,
                              }}
                            >
                              <Plus size={13} strokeWidth={2.4} />
                            </button>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: palette.textMute }}>{typeOption.name} · {selectedSize?.name || item.selectedSizeId}</div>
                            <div style={{ marginTop: 2, fontSize: 18, fontWeight: 800, color: palette.text }}>{formatPrice(totalPrice)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <section
            style={{
              marginTop: 14,
              border: `1px solid ${palette.border}`,
              borderRadius: 16,
              background: palette.panelBg,
              padding: 14,
            }}
          >
            <div style={{ marginBottom: 10, fontSize: 10, color: palette.textMute, letterSpacing: "0.13em", textTransform: "uppercase" }}>
              {t({ ko: "결제 수단", en: "Payment" })}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {PAYMENT_METHODS.map((method) => {
                const active = selectedPayment === method.id;
                return (
                  <button
                    key={method.id}
                    onClick={() => setSelectedPayment(method.id)}
                    style={{
                      cursor: "pointer",
                      border: `1px solid ${active ? palette.accent : palette.borderSoft}`,
                      background: active ? palette.chipActive : palette.chip,
                      borderRadius: 10,
                      padding: "10px 8px",
                      color: palette.text,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 6,
                        background: method.color,
                        color: method.id === "kakaopay" ? "#111" : "#fff",
                        fontSize: 11,
                        fontWeight: 700,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {method.short}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{method.name}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: palette.textMute }}>
                  {t({ ko: "선택 상품", en: "Selected" })} {selectedCount}{t({ ko: "개", en: " items" })}
                </div>
                <div style={{ marginTop: 2, fontSize: "clamp(24px, 5vw, 34px)", color: palette.text, fontWeight: 800, letterSpacing: "-0.02em" }}>
                  {formatPrice(selectedTotal)}
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={clearCart}
                  style={{
                    cursor: "pointer",
                    border: `1px solid ${palette.border}`,
                    borderRadius: 10,
                    padding: "11px 12px",
                    background: palette.chip,
                    color: palette.textSub,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {t({ ko: "전체 비우기", en: "Clear cart" })}
                </button>
                <button
                  onClick={handleCheckout}
                  style={{
                    cursor: "pointer",
                    border: `1px solid ${selectedPayment ? palette.accent : palette.border}`,
                    borderRadius: 10,
                    padding: "11px 16px",
                    minWidth: 170,
                    background: selectedPayment ? palette.accentBg : palette.chip,
                    color: selectedPayment ? "#101010" : palette.textSub,
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {t({ ko: "선택 상품 구매", en: "Checkout selected" })}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
