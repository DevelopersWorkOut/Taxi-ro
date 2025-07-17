const fs = require('fs');
const csv = require('csv-parser');

const results = [];
fs.createReadStream('metro_20250417.csv')
  .pipe(csv())
  .on('data', (data) => {
    // 실제 key를 동적으로 찾음
    const idKey = Object.keys(data).find(k => k.includes('역번호'));
    const nameKey = Object.keys(data).find(k => k.includes('역사명'));
    const latKey = Object.keys(data).find(k => k.includes('역위도'));
    const lngKey = Object.keys(data).find(k => k.includes('역경도'));
    const lineNameKey = Object.keys(data).find(k => k.includes('노선명'));
    const stationAddress = Object.keys(data).find(k => k.includes('역사도로명주소'));
    const transferLineNameKey = Object.keys(data).find(k => k.includes('환승노선명'));
    if (data[latKey] && data[lngKey]) {
      results.push({
        id: data[idKey],
        name: data[nameKey],
        lat: parseFloat(data[latKey]),
        lng: parseFloat(data[lngKey]),
        lineName: data[lineNameKey],
        transferLineName: data[transferLineNameKey],
        stationAddress: data[stationAddress],
      });
    }
  })
  .on('end', () => {
    fs.writeFileSync('assets/stations.json', JSON.stringify(results, null, 2));
    console.log('변환 완료! assets/stations.json 파일이 생성되었습니다.');
  });