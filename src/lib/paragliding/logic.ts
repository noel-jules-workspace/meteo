export interface WindConditions {
  color: 'green' | 'orange' | 'red';
  breakdowns: string[];
}

export function getWindConditions(speedKmh: number, gustKmh: number): WindConditions {
  const speedMph = speedKmh * 0.621371;
  const gustMph = gustKmh * 0.621371;

  let color: 'green' | 'orange' | 'red' = 'green';
  const breakdowns: string[] = [];

  // Gust Spread (Variance)
  const spreadMph = gustMph - speedMph;
  if (spreadMph > 5) {
    color = 'red';
    breakdowns.push("Max Safe Gust Spread exceeded (>5 mph). Severe thermal turbulence/rotor risk.");
  } else {
    breakdowns.push("Gust spread within safe limits (<=5 mph).");
  }

  // Sustained Base Wind
  if (speedMph > 15) {
    color = 'red';
    breakdowns.push("Sustained Base Wind too high (>15 mph). Narrow penetration margin.");
  } else if (speedMph > 12) {
    if (color === 'green') color = 'orange';
    breakdowns.push("Sustained Base Wind high (12-15 mph). For experienced pilots.");
  } else {
    breakdowns.push("Sustained Base Wind good (<=12 mph).");
  }

  // Blow-Back Danger Zone
  if (speedMph >= 18 || gustMph >= 18) {
    color = 'red';
    breakdowns.push("Blow-Back Danger Zone (>=18 mph). Risk of zero forward speed or blow-back.");
  } else if (speedMph > 15 || gustMph > 15) {
    if (color === 'green') color = 'orange';
    breakdowns.push("Approaching Blow-Back Danger (>15 mph).");
  }

  return { color, breakdowns };
}
