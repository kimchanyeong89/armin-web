import React, { useState } from 'react';
import GlobeMapChart from './GlobeMapChart';
import FlatMapChart from './FlatMapChart';

const WorldMapContainer: React.FC = () => {
  const [isGlobe, setIsGlobe] = useState(true);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <div style={{ textAlign: 'center', margin: '10px' }}>
        <button onClick={() => setIsGlobe(!isGlobe)}>
          {isGlobe ? '평면지도로 전환' : '지구본으로 전환'}
        </button>
      </div>
      <div style={{ width: '100%', height: 'calc(100% - 50px)' }}>
        {isGlobe ? <GlobeMapChart /> : <FlatMapChart />}
      </div>
    </div>
  );
};

export default WorldMapContainer;