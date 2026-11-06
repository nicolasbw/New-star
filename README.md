# ★ New Star

Simulador de carreira de jogador de futebol no navegador (PT/EN).
Comece aos 14 anos na base de um clube fictício e construa sua carreira
semana a semana, com partidas em 3D, nas quais você decide o que o seu
jogador faz nos momentos-chave.

## Como rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # gera dist/ (site estático)
```

## Como funciona

**Modo vida (semana a semana)**
- 2 atividades por semana: treinos (finalização, físico, técnico, tático,
  personal trainer, vídeo), descanso, família, amigos, redes sociais e
  evento do patrocinador.
- Energia, moral, fama, seguidores, dinheiro e relação com o técnico e o elenco.
- Eventos aleatórios com escolhas e consequências: festas, entrevistas,
  lesões, patrocínios, empresário, polêmicas, convocação ao profissional,
  propostas de transferência, capitania e outros.
- Loja (videogame, carros, apartamento, mansão, iate...).
- Liga Sub-20 e Liga Nacional, cada uma com 10 clubes fictícios. Há promoção
  ao time profissional, contratos, prêmios e aposentadoria.

**Partida 3D (Three.js, câmera lateral de TV)**
- Simulação 11 contra 11 com IA de posicionamento, pressão, passes,
  interceptações, desarmes, chutes, escanteios, laterais e tiros de meta.
- Quando a bola chega em você, o jogo entra em câmera lenta e mostra opções
  com a chance de sucesso:
  - **com a bola**: passe curto, enfiada, lançamento, cruzamento, driblar,
    avançar, proteger e chutes (forte, colocado, de longe, cavadinha);
  - **jogadas especiais**, liberadas por atributo: elástico, chapéu, arrancada;
  - **bola aérea**: cabeceio, chute de primeira, bicicleta, dominar no peito;
  - **sem a bola**: pedir a bola, infiltrar nas costas da zaga, entrar na área;
  - **defendendo**: dar o bote, carrinho (com risco de cartão), pressionar,
    fechar a linha de passe.
- Teclas 1–6 escolhem a opção. Se o tempo acabar, o jogador escolhe a opção mais segura.
- Os trechos em que você não participa passam acelerados. Uma partida dura
  de 5 a 8 minutos.

## Estrutura

```
src/core     tipos, utilidades, i18n (pt/en)
src/career   carreira, liga, eventos, jogador, dados
src/match    engine.ts (simulação 2D + decisões) · render.ts (Three.js)
src/ui       app.ts (telas) · match.ts (HUD da partida)
scripts      testes sem interface (balanceamento, carreira, traduções)
```

`npm run test:sim`, `npm run test:career` e `npm run test:i18n` rodam as
simulações e as checagens sem abrir o navegador.
