'use strict';

const WEATHER_NAMES = { sun: 'はれ', rain: 'あめ', sand: 'すなあらし' };

function getWeatherMoveMult(weather, moveType) {
  if (weather === 'sun') {
    if (moveType === 'ほのお') return 1.5;
    if (moveType === 'みず') return 0.5;
  }
  if (weather === 'rain') {
    if (moveType === 'みず') return 1.5;
    if (moveType === 'ほのお') return 0.5;
  }
  return 1;
}

function setWeather(game, type, turns, ctx) {
  const prev = game.weather?.type;
  game.weather = { type, turns };
  if (prev !== type && ctx) {
    const name = WEATHER_NAMES[type] || '';
    const msg = type ? `${name}になった！` : '天気がやんだ！';
    ctx.state.game.log.push(msg);
    ctx.addEffect({ kind: 'message', side: 'A', message: msg });
  }
}

function applyWeatherEndOfTurn(ctx) {
  const g = ctx.state.game;
  if (!g.weather?.type) return;

  if (g.weather.type === 'sand') {
    ['A', 'B'].forEach(side => {
      const pokemon = ctx.active(side);
      if (!pokemon || pokemon.fainted) return;
      if (pokemon.types.some(t => ['いわ', 'はがね', 'じめん'].includes(t))) return;
      if (pokemon.ability === 'すながくれ' || pokemon.ability === 'すなはき' || pokemon.ability === 'すなのちから') return;
      if (pokemon.item === 'ぼうじんゴーグル') return;
      if (pokemon.ability === 'マジックガード') return;
      const dmg = Math.max(1, Math.floor(pokemon.maxHp / 16));
      const hpBefore = pokemon.hp;
      pokemon.hp = Math.max(0, pokemon.hp - dmg);
      const msg = `${pokemon.name}はすなあらしのダメージを受けた！ (-${dmg})`;
      g.log.push(msg);
      ctx.addEffect({ kind: 'damage', side, hpBefore, hpAfter: pokemon.hp, targetIndex: g.active[side], labels: [{ text: 'すなあらし', tone: 'ability-blue' }], message: msg });
      if (pokemon.hp <= 0 && !pokemon.fainted) {
        pokemon.fainted = true;
        const fm = `${pokemon.name}は気絶した！`;
        g.log.push(fm);
        ctx.addEffect({ kind: 'faint', side, targetIndex: g.active[side], hpAfter: 0, message: fm });
      }
    });
  }

  g.weather.turns--;
  if (g.weather.turns <= 0) {
    const name = WEATHER_NAMES[g.weather.type] || '';
    const msg = `${name}がやんだ！`;
    g.log.push(msg);
    ctx.addEffect({ kind: 'message', side: 'A', message: msg });
    g.weather.type = null;
  }
}

function getSandSpDefBoost(pokemon, weather) {
  if (weather === 'sand' && pokemon.types.includes('いわ')) return 1.5;
  return 1;
}

function thunderAccuracy(weather) {
  if (weather === 'rain') return 9999;
  if (weather === 'sun') return 50;
  return 70;
}

function hurricaneAccuracy(weather) {
  if (weather === 'rain') return 9999;
  if (weather === 'sun') return 50;
  return 70;
}

module.exports = {
  WEATHER_NAMES,
  getWeatherMoveMult, setWeather,
  applyWeatherEndOfTurn, getSandSpDefBoost,
  thunderAccuracy, hurricaneAccuracy,
};
