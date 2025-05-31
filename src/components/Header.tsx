import { useNavigate } from 'react-router-dom';
import logo from '../assets/armin-logo.png';

const Header = () => {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px' }}>
      <img
        src={logo}
        alt="Armin Logo"
        style={{ width: '30px', height: '30px', marginRight: '8px', cursor: 'pointer' }}
        onClick={() => navigate('/')}
      />
      <h1
        style={{ cursor: 'pointer', fontSize: '20px', fontWeight: 'bold' }}
        onClick={() => navigate('/')}
      >
        Armin
      </h1>
    </div>
  );
};

export default Header;