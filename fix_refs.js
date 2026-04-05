const fs = require('fs');
const filepath = 'src/components/InteractiveGlobeMap/Globe.tsx';
let txt = fs.readFileSync(filepath, 'utf8');

// 1. Add drilledContinentRef definition
const addRefStr = `  const selectedRef = useRef(selectedCity);
  useEffect(() => { selectedRef.current = selectedCity; }, [selectedCity]);`;
const newRefStr = `  const drilledContinentRef = useRef(drilledContinent);
  useEffect(() => { drilledContinentRef.current = drilledContinent; }, [drilledContinent]);

  const selectedRef = useRef(selectedCity);
  useEffect(() => { selectedRef.current = selectedCity; }, [selectedCity]);`;

txt = txt.replace(addRefStr, newRefStr);

// 2. Replace drilledContinent with drilledContinentRef.current inside the file
// I will replace exact words. Wait, inside Globe argument it's `drilledContinent,` and in `cbRefs` maybe, but wait `drilledContinent !== ...`
// Let's manually replace the occurrences inside the specific methods like animate(), handleClick(), etc.
// Instead of aconst fs = requwhich could bconst filepath = 'sr regexlet txt = fs.readFileSync(filepath, 'utf8');

// 1. Add drilledll
// 1. Add drilledContinentRef definition
centconst addRefStr = `  const selectedRef ti  useEffect(() => { selectedRef.current = selectedCity; }, [sinconst newRefStr = `  const drilledContinentRef = useRef(drilledContinent);
 nt  useEffect(() => { drilledContinentRef.current = drilledContinent; }, [ded
  const selectedRef = useRef(selectedCity);
  useEffect(() => { selectedRef.current = seling  useEffect(() => { selectedRef.current = fi
txt 'utf8');
