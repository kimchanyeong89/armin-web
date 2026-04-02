import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const App = () => (
    <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: '#FFFFFF',
        border: '3px solid #111111',
        borderRadius: 9999,
        boxShadow: '8px 8px 0px 0px rgba(17,17,17,1)',
    }}>
      <div style={{ width: '40px', height: '40px', background: '#111111', borderRadius: '50%'}}>
      </div>
    </div>
);
console.log(renderToStaticMarkup(<App />));
