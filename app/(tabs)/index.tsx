import Slider from '@react-native-community/slider';
import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import stations from '../../assets/stations.json';

// 2. 거리 계산 함수 (Haversine 공식)
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// 3. 서울 택시비 계산 함수 (2024 기준, 단순화)
function calculateTaxiFare(distanceMeters: number, isSurcharge: boolean): number {
  // 기본요금: 1.6km까지 4,800원
  const baseDistance = 1600;
  const baseFare = 4800;
  const distanceFarePerUnit = 100; // 131m당 100원
  const distanceUnit = 131;

  let fare = baseFare;
  if (distanceMeters > baseDistance) {
    const extraDistance = distanceMeters - baseDistance;
    fare += Math.ceil(extraDistance / distanceUnit) * distanceFarePerUnit;
  }

  // 시외할증 20%
  if (isSurcharge) {
    fare = Math.round(fare * 1.2);
  }

  return fare;
}

// 출발지/목적지의 시/도(행정구역명) 얻기 (출발지는 reverseGeocode, 목적지는 도로명주소 기반)
function extractRegionFromAddress(address: string): string {
  if (!address) return '';
  // 도로명주소에서 맨 앞(시/도)만 추출
  return address.split(' ')[0];
}

// 목적지의 stationAddress에서 '시'로 끝나는 첫 단어만 추출
function extractSiFromAddress(address: string): string {
  if (!address) return '';
  const parts = address.split(' ');
  // '시'로 끝나는 첫 단어만 반환
  const si = parts.find(word => word.endsWith('시'));
  return si || '';
}

async function getRegionName(lat: number, lng: number) {
  try {
    const [info] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    return info.region || '';
  } catch {
    return '';
  }
}

export default function HomeScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [budget, setBudget] = useState(10000); // 예산(원)
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startCity, setStartCity] = useState<string>('');
  const [cityCache, setCityCache] = useState<{ [key: string]: string }>({}); // 목적지별 시/군/구 캐시
  const [search, setSearch] = useState(''); // 역이름 검색어 상태 추가

  // 1. 역 데이터 중 위도/경도 없는 항목 제외 + id 중복 제거
  const validStations = React.useMemo(() => {
    const seen = new Set();
    return stations.filter((s: any) => {
      if (
        typeof s.lat !== 'number' ||
        typeof s.lng !== 'number' ||
        !s.id ||
        isNaN(s.lat) ||
        isNaN(s.lng) ||
        seen.has(s.id)
      ) {
        return false;
      }
      seen.add(s.id);
      return true;
    });
  }, [stations]);

  // 현재 위치 및 출발지 시 얻기
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('위치 권한이 거부되었습니다.');
        setLoading(false);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc);
      // 출발지 시
      const [info] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setStartCity(info.city || '');
      setLoading(false);
    })();
  }, []);

  // 목적지별 시/군/구 캐시 생성
  useEffect(() => {
    if (!location) return;
    const cache: { [key: string]: string } = {};
    let isMounted = true;
    (async () => {
      for (const place of validStations) {
        const key = `${place.lat},${place.lng}`;
        if (!cache[key]) {
          cache[key] = await getRegionName(place.lat, place.lng);
        }
      }
      if (isMounted) setCityCache(cache);
    })();
    return () => { isMounted = false; };
  }, [location, validStations]);

  // 예산 내 추천 지역 필터링
  useEffect(() => {
    if (!location || !startCity) return;
    const result = validStations
      .map((place: any) => {
        const dist = getDistanceFromLatLonInKm(
          location.coords.latitude,
          location.coords.longitude,
          place.lat,
          place.lng
        );
        // 목적지 시: 도로명주소에서 추출
        const destSi = extractSiFromAddress(place.stationAddress);
        const isOutOfCity = !!(startCity && destSi && startCity !== destSi);
        const fare = calculateTaxiFare(dist * 1000, isOutOfCity); // 거리를 미터로 변환하여 계산
        return { ...place, dist: dist.toFixed(2), fare, isOutOfCity, destSi };
      })
      .filter(
        (place: any) =>
          !isNaN(place.fare) &&
          place.fare <= budget &&
          !isNaN(Number(place.dist))
      )
      .sort((a, b) => a.fare - b.fare); // 예상 택시비 오름차순 정렬
    setFiltered(result);
  }, [location, budget, validStations, startCity]);

  // 검색어 적용된 리스트
  const searched = React.useMemo(() => {
    if (!search) return filtered;
    return filtered.filter((item) =>
      item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [filtered, search]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>위치 정보를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={styles.title}>택시비 예산(원): {budget.toLocaleString()}원</Text>
        {/* 검색창 추가 */}
        {Platform.OS === 'web' ? (
          <input
            type="text"
            placeholder="역 이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: 8, marginBottom: 10, borderRadius: 6, border: '1px solid #ccc' }}
          />
        ) : (
          <View style={{ width: '100%', marginBottom: 10 }}>
            <TextInput
              placeholder="역 이름 검색"
              value={search}
              onChangeText={setSearch}
              style={{ backgroundColor: '#f5f5f5', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ccc' }}
            />
          </View>
        )}
        {/* 슬라이더: 웹/모바일 호환 */}
        {Platform.OS === 'web' ? (
          <input
            type="range"
            min={5000}
            max={40000}
            step={1000}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            style={{ width: '100%' }}
          />
        ) : (
          <Slider
            minimumValue={5000}
            maximumValue={40000}
            step={1000}
            value={budget}
            onValueChange={setBudget}
            style={{ width: '100%' }}
          />
        )}
        <Text style={{ marginTop: 20, fontWeight: 'bold' }}>
          예산 내 추천 지역 ({searched.length}곳):
        </Text>
        <FlatList
          data={searched}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={{ fontSize: 16 }}>{item.name}</Text>
              <Text style={{ fontSize: 12, color: '#888' }}>
                {item.lineName}
                {item.transferLineName ? ` / 환승: ${item.transferLineName}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {item.isOutOfCity && (
                  <Text style={{
                    color: 'red',
                    fontSize: 10,
                    backgroundColor: '#ffeaea',
                    borderRadius: 4,
                    paddingHorizontal: 4,
                    marginLeft: 4,
                    alignSelf: 'flex-start'
                  }}>
                    시외할증
                  </Text>
                )}
                <Text style={{ fontSize: 12, color: '#888' }}>
                  거리: {item.dist}km / 예상 택시비: {item.fare.toLocaleString()}원
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text>해당 예산/검색어로 갈 수 있는 지역이 없습니다.</Text>}
          style={{ marginTop: 10 }}
        />
        <MapView
          style={{ flex: 1, minHeight: 300 }}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
        >
          <Marker
            coordinate={{
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }}
            title="내 위치"
            pinColor="blue"
          />
          {searched.map((place) => (
            <Marker
              key={place.id}
              coordinate={{ latitude: place.lat, longitude: place.lng }}
              title={place.name}
              description={`노선: ${place.lineName || ''}${place.transferLineName ? ` / 환승: ${place.transferLineName}` : ''}\n${place.isOutOfCity ? '시외할증 적용\n' : ''}예상 택시비: ${place.fare.toLocaleString()}원`}
            />
          ))}
        </MapView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  item: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
});
