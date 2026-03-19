import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const PaymentSuccessPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'success' | 'fail'>('loading');
    const [orderData, setOrderData] = useState<any>(null);
    const [errorMessage, setErrorMessage] = useState<string>('');

    useEffect(() => {
        const paymentKey = searchParams.get('paymentKey');
        const orderId = searchParams.get('orderId');
        const amount = Number(searchParams.get('amount'));

        // 결제 실패 리다이렉트 처리
        const failCode = searchParams.get('code');
        const failMessage = searchParams.get('message');
        if (failCode) {
            setStatus('fail');
            setErrorMessage(failMessage || '결제가 취소되었거나 실패했습니다.');
            return;
        }

        if (!paymentKey || !orderId || !amount) {
            setStatus('fail');
            setErrorMessage('잘못된 접근입니다. 결제 정보가 누락되었습니다.');
            return;
        }

        const confirmPayment = async () => {
            try {
                // Cloudflare Function API 호출 (결제 승인)
                const response = await fetch('/api/payment/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentKey, orderId, amount }),
                });

                const json = await response.json();

                if (!response.ok) {
                    throw new Error(json.message || json.code || '결제 승인에 실패했습니다.');
                }

                setOrderData(json);

                // Firestore에 주문 정보 저장
                try {
                    await addDoc(collection(db, 'orders'), {
                        ...json,
                        createdAt: serverTimestamp(),
                        status: 'PAID',
                        provider: 'TOSS_PAYMENTS' // 토스페이먼츠 통해 결제됨
                    });
                    // console.log('Order saved to Firestore');
                } catch (dbErr) {
                    console.error('Failed to save order to Firestore:', dbErr);
                    // DB 저장이 실패해도 결제는 성공했으므로 진행
                }

                setStatus('success');
            } catch (err: any) {
                console.error('Payment Confirm Error:', err);
                setStatus('fail');
                setErrorMessage(err.message || '알 수 없는 오류가 발생했습니다.');
            }
        };

        confirmPayment();
    }, [searchParams]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            background: '#f5f5f5',
            color: '#333',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
            {status === 'loading' && (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 20 }}>🔄</div>
                    <h2>결제 승인 중입니다...</h2>
                    <p>잠시만 기다려주세요.</p>
                </div>
            )}

            {status === 'success' && (
                <div style={{
                    padding: 40,
                    background: '#fff',
                    borderRadius: 16,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    maxWidth: 400,
                    width: '90%',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: 60, marginBottom: 20 }}>🎉</div>
                    <h2 style={{ margin: '0 0 10px 0', fontSize: 24 }}>결제가 완료되었습니다!</h2>
                    <p style={{ color: '#666', marginBottom: 30 }}>주문해주셔서 감사합니다.</p>

                    <div style={{
                        marginBottom: 30,
                        textAlign: 'left',
                        background: '#f9f9f9',
                        padding: 20,
                        borderRadius: 8,
                        fontSize: 14,
                        lineHeight: 1.6
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#666' }}>주문번호</span>
                            <span style={{ fontWeight: 600 }}>{orderData?.orderId}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                            <span style={{ color: '#666' }}>상품명</span>
                            <span style={{ fontWeight: 600, maxWidth: '180px', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {orderData?.orderName}
                            </span>
                        </div>
                        <div style={{ borderTop: '1px solid #eee', margin: '12px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
                            <span style={{ fontWeight: 600 }}>결제금액</span>
                            <span style={{ fontWeight: 700, color: '#e11d48' }}>
                                {orderData?.totalAmount?.toLocaleString()}원
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate('/')}
                        style={{
                            width: '100%',
                            padding: '14px',
                            background: '#222',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 12,
                            cursor: 'pointer',
                            fontSize: 16,
                            fontWeight: 600,
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = '#000'}
                        onMouseOut={(e) => e.currentTarget.style.background = '#222'}
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            )}

            {status === 'fail' && (
                <div style={{ textAlign: 'center', maxWidth: 400, padding: 20 }}>
                    <div style={{ fontSize: 60, marginBottom: 20 }}>⚠️</div>
                    <h2 style={{ color: '#e11d48', marginBottom: 10 }}>결제 승인에 실패했습니다.</h2>
                    <p style={{ color: '#666', marginBottom: 20 }}>{errorMessage}</p>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            padding: '12px 24px',
                            background: '#fff',
                            border: '1px solid #ddd',
                            borderRadius: 8,
                            cursor: 'pointer',
                            fontSize: 14
                        }}
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            )}
        </div>
    );
};
