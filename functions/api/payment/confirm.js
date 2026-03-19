
export async function onRequestPost({ request, env }) {
    try {
        const { paymentKey, orderId, amount } = await request.json();

        // 토스페이먼츠 시크릿 키 (환경 변수 TOSS_SECRET_KEY 사용)
        const secretKey = env.TOSS_SECRET_KEY;

        if (!secretKey) {
            return new Response(JSON.stringify({ message: "Server configuration error: TOSS_SECRET_KEY is missing." }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // 토스페이먼츠 승인 API 호출
        const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(secretKey + ':')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Toss Payments Confirm Error:', data);
            return new Response(JSON.stringify(data), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // TODO: 결제 성공 시 DB(Firebase 등)에 주문 정보 저장 로직을 여기에 추가할 수 있습니다.

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Server Error:', error);
        return new Response(JSON.stringify({ message: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
