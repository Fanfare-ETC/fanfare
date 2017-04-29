'use strict';
import * as PIXI from 'pixi.js';
import 'pixi-action';
import { EventEmitter } from 'eventemitter3';
import * as FontFaceObserver from 'fontfaceobserver';

import PlaybookEvents,
{
  Teams as PlaybookEventsTeams,
  StringMap as PlaybookEventsStringMap
} from './lib/PlaybookEvents';
import GoalTypes from './lib/collection/GoalTypes';
import V4Goal from './lib/collection/V4Goal';
import PlaybookBridge from './lib/collection/PlaybookBridge';
import PlaybookRenderer from './lib/collection/PlaybookRenderer';

import CardSlot from './lib/collection/CardSlot';
import IGameState from './lib/collection/IGameState';
import ICard from './lib/collection/ICard';

// Receive messages from the hosting application.
if (window.PlaybookBridge) {
  window.addEventListener('message', function (e) {
    const message = e.data;
    switch (message.action) {
      case 'RESTORE_GAME_STATE':
        console.log('Restoring state from hosting application: ');
        try {
          state.fromJSON(message.payload);
        } catch (e) {
          console.error('Error restoring state due to exception: ', e);
          state.reset(true);
          window.location.href = window.location.href;
        }
        break;
      case 'HANDLE_MESSAGE':
        console.log('Handling message from hosting application: ');
        handleIncomingMessage(message.payload);
        break;
    }
  });
}

class GameState implements IGameState {
  EVENT_ACTIVE_CARD_CHANGED: string = 'activeCardChanged';
  EVENT_INCOMING_CARDS_CHANGED: string = 'incomingCardsChanged';
  EVENT_GOAL_CHANGED: string = 'goalChanged';
  EVENT_CARD_SLOTS_CHANGED: string = 'cardSlotsChanged';
  EVENT_SELECTED_GOAL_CHANGED: string = 'selectedGoalChanged';
  EVENT_SCORE_CHANGED: string = 'scoreChanged';

  emitter: EventEmitter;

  _activeCard: Card | null = null;
  _incomingCards: string[] = [];
  _goal: string | null;
  cards: PIXI.Sprite[] = [];
  _cardSlots: CardSlot[] = [];
  goalSets: { [goal: string]: Card[] } = {};
  _selectedGoal: string | null = null;
  _score: number = 0;

  constructor() {
    this.emitter = new EventEmitter();
    this.reset();
  }

  /**
   * Resets the game state.
   * @param {boolean} persist
   */
  reset(persist: boolean = false) {
    if (persist) {
      PlaybookBridge.notifyGameState(this.toJSON());
    }
  }

  get activeCard() {
    return this._activeCard;
  }

  set activeCard(value) {
    const oldValue = this._activeCard;
    this._activeCard = value;
    console.log('activeCard->', value);
    this.emitter.emit(this.EVENT_ACTIVE_CARD_CHANGED, value, oldValue);
    PlaybookBridge.notifyGameState(this.toJSON());
  }

  get incomingCards() {
    return this._incomingCards;
  }

  set incomingCards(value) {
    const oldValue = this._incomingCards;
    this._incomingCards = value;
    console.log('incomingCards->', value);
    this.emitter.emit(this.EVENT_INCOMING_CARDS_CHANGED, value, oldValue);
    PlaybookBridge.notifyGameState(this.toJSON());
  }

  get goal() {
    return this._goal;
  }

  set goal(value) {
    const oldValue = this._goal;
    this._goal = value;
    console.log('goal->', value);
    this.emitter.emit(this.EVENT_GOAL_CHANGED, value, oldValue);
    PlaybookBridge.notifyGameState(this.toJSON());
  }

  get cardSlots() {
    return this._cardSlots;
  }

  set cardSlots(value) {
    const oldValue = this._cardSlots;
    this._cardSlots = value;
    console.log('cardSlots->', value);
    this.emitter.emit(this.EVENT_CARD_SLOTS_CHANGED, value, oldValue);
    PlaybookBridge.notifyGameState(this.toJSON());
  }

  get selectedGoal() {
    return this._selectedGoal;
  }

  set selectedGoal(value) {
    const oldValue = this._selectedGoal;
    this._selectedGoal = value;
    console.log('selectedGoal->', value);
    this.emitter.emit(this.EVENT_SELECTED_GOAL_CHANGED, value, oldValue);
    PlaybookBridge.notifyGameState(this.toJSON());
  }

  get score() {
    return this._score;
  }

  set score(value) {
    const oldValue = this._score;
    this._score = value;
    console.log('score->', value);
    this.emitter.emit(this.EVENT_SCORE_CHANGED, value, oldValue);
    PlaybookBridge.notifyGameState(this.toJSON());
  }

  /**
   * Returns the game state as JSON.
   */
  toJSON() {
    // We need to remove the sprite because that can't be serialized.
    const cardSlots = this.cardSlots.map(slot => {
      return {
        present: slot.present,
        card: slot.present && slot.card ? {
          isActive: slot.card.isActive,
          play: slot.card.play,
          team: slot.card.team
        } : null
      }
    });

    const savedState = {
      activeCard: this.activeCard ? this.activeCard.play : null,
      incomingCards: this.incomingCards,
      goal: this.goal,
      cardSlots: cardSlots,
      score: this.score
    };

    return JSON.stringify(savedState);
  }

  /**
   * Restores the game state from JSON.
   */
  fromJSON(state: string) {
    console.log('fromJSON', state);

    // Create empty card slots.
    for (let i = 0; i < 5; i++) {
      this.cardSlots[i] = new CardSlot();
    }

    const restoredState = JSON.parse(state);
    if (restoredState !== null) {
      restoredState.cardSlots.forEach((slot: any, index: number) => {
        this._cardSlots[index].present = slot.present;
        if (slot.present) {
          const card = createCard(slot.card.play, false, index);
          if (card !== null) {
            Object.assign(card, slot.card);
            initCardEvents(card);
            card.moveToSlot(index);
            this._cardSlots[index].card = card;
          } else {
            console.warn('fromJSON', 'createCard returned null!');
          }
        }
      });

      if (restoredState.activeCard !== null) {
        receiveCard(restoredState.activeCard);
      }

      this._incomingCards = restoredState.incomingCards ? restoredState.incomingCards : [];
      this._goal = restoredState.goal;
      this._score = restoredState.score;

      // Trigger initial updates.
      this.emitter.emit(this.EVENT_ACTIVE_CARD_CHANGED, this._activeCard, null);
      this.emitter.emit(this.EVENT_INCOMING_CARDS_CHANGED, this._incomingCards, null);
      this.emitter.emit(this.EVENT_GOAL_CHANGED, this._goal, null);
      this.emitter.emit(this.EVENT_CARD_SLOTS_CHANGED, this._cardSlots, null);
      this.emitter.emit(this.EVENT_SCORE_CHANGED, this._score, null);
    }
  }
}

const connection = new WebSocket(PlaybookBridge.getAPIUrl());
const renderer = new PlaybookRenderer();
const stage = new PIXI.Container();
const state = new GameState();

// Content scale will be updated on first draw.
let contentScale: number | null = null;

/**
 * Card.
 */
class Card implements ICard {
  play: string;
  team: string;
  sprite: PIXI.Sprite;
  isBeingDragged: boolean = false;
  dragPointerId: number | null = null;
  dragOffset: PIXI.Point | null = null;
  dragOrigPosition: PIXI.Point | null = null;
  dragOrigRotation: number | null = null;
  dragOrigScale: number | null = null;
  dragTarget: PIXI.Sprite | number | null = null;
  isAnimating: number = 0;
  isActive: boolean = true;

  constructor(team: string, play: string, card: PIXI.Sprite) {
    this.play = play;
    this.team = team;
    this.sprite = card;
  }

  /**
   * Moves this card to a specific position in world space with animation.
   */
  _moveToWithAnimation(position: PIXI.Point) {
    const moveTo = new PIXI.action.MoveTo(position.x, position.y, 0.25);
    const callFunc = new PIXI.action.CallFunc(() => this.isAnimating--);
    const sequence = new PIXI.action.Sequence([moveTo, callFunc]);
    this.isAnimating++;
    PIXI.actionManager.runAction(this.sprite, sequence);
    return sequence;
  }

  /**
   * Rotates this card to a specific position in world space with animation.
   */
  _rotateToWithAnimation(rotation: number) {
    const rotateTo = new PIXI.action.RotateTo(rotation, 0.25);
    const callFunc = new PIXI.action.CallFunc(() => this.isAnimating--);
    const sequence = new PIXI.action.Sequence([rotateTo, callFunc]);
    this.isAnimating++;
    PIXI.actionManager.runAction(this.sprite, sequence);
    return sequence;
  }

  /**
   * Scales this card to a specific scale in world space with animation.
   */
  _scaleToWithAnimation(scale: number) {
    const scaleTo = new PIXI.action.ScaleTo(scale, scale, 0.25);
    const callFunc = new PIXI.action.CallFunc(() => this.isAnimating--);
    const sequence = new PIXI.action.Sequence([scaleTo, callFunc]);
    this.isAnimating++;
    PIXI.actionManager.runAction(this.sprite, sequence);
    return sequence;
  }

  /**
   * Moves this card to its original location.
   */
  moveToOrigPosition() {
    if (this.dragOrigPosition !== null && this.dragOrigRotation !== null &&
        this.dragOrigScale !== null) {
      this._moveToWithAnimation(this.dragOrigPosition); //probably the original slot it was residing
      this._rotateToWithAnimation(this.dragOrigRotation);
      this._scaleToWithAnimation(this.dragOrigScale);
    } else {
      console.warn('moveToOrigPosition', 'dragOrigPosition, dragOrigRotation or dragOrigScale was null!');
    }
  }

  /**
   * Moves this card to a specific slot.
   * @param {number} slot
   * @return {PIXI.action.Sequence}
   */
  moveToSlot(slot: number) : PIXI.action.Sequence {
    return this._moveToWithAnimation(getCardPositionForSlot(this.sprite.texture, slot));
  }
}

/**
 * Sets up events for an active card.
 */
function initCardEvents(card: Card) {
  card.sprite.interactive = true;

  const onTouchStart = function (e: PIXI.interaction.InteractionEvent) {
    // Don't allow interaction if card is being animated.
    if (card.isAnimating) { return; }

    // If the card is active, scale it down to the normal size.
    if (card.isActive) {
      const scale = getCardScaleInSlot(card.sprite.texture);
      const scaleTo = new PIXI.action.ScaleTo(scale, scale, 0.25);
      const rotateTo = new PIXI.action.RotateTo(0.0, 0.25);

      PIXI.actionManager.runAction(card.sprite, scaleTo);
      PIXI.actionManager.runAction(card.sprite, rotateTo);
    }

    // Offset the drag so we get an accurate touch point.
    if (e.data.identifier) {
      card.isBeingDragged = true;
      card.dragPointerId = e.data.identifier;
      card.dragOffset = e.data.getLocalPosition(card.sprite);
      card.dragOffset.x *= card.sprite.scale.x;
      card.dragOffset.y *= card.sprite.scale.y;
      card.dragOrigPosition = new PIXI.Point(
        card.sprite.position.x,
        card.sprite.position.y
      );
      card.dragOrigRotation = card.sprite.rotation;
      card.dragOrigScale = card.sprite.scale.x;
    } else {
      console.warn('e.data.identifier was undefined!');
    }
  };

  const onTouchMove = function (e: PIXI.interaction.InteractionEvent) {
    if (card.isBeingDragged &&
      card.dragPointerId === e.data.identifier) {
      if (card.dragOffset === null) {
        console.warn('card.dragOffset was null!');
        return;
      }

      card.sprite.position.set(
        e.data.global.x - card.dragOffset.x,
        e.data.global.y - card.dragOffset.y
      );

      // Check if we're above score or discard buttons.
      card.dragTarget = getTargetByPoint(card, new PIXI.Point(
        e.data.global.x,
        e.data.global.y
      ));

      // Tint card red when in the discard zone.
      const discard = stage.getChildByName('discard');
      if (card.dragTarget === discard) {
        card.sprite.tint = 0xff0000;
      } else {
          card.sprite.tint = 0xffffff;
      }

      // Re-render the scene.
      renderer.markDirty();
    }
  };

  const onTouchEnd = function (e: PIXI.interaction.InteractionEvent) {
    // Don't allow interaction if card is being animated.
    if (card.isAnimating || !card.isBeingDragged) { return; }
    card.isBeingDragged = false;

    // If there's a drag target, move the card there.
    // If discard: destroy the card
    // If score: add the score
    // If slot number: move to a slot
    if (card.dragTarget === stage.getChildByName('discard')) {
      discardCard(card);
    } else if (card.dragTarget !== null &&
               card.dragTarget >= 0 && card.dragTarget < 6) {
      if (card.dragTarget !== null && !state.cardSlots[card.dragTarget as number].present) {
        assignCardToSlot(card, card.dragTarget as number);
      } else {
        card.moveToOrigPosition();
      }
    } else if (card.dragTarget instanceof V4Goal) {
      console.log('Dragged card to goal!');
      card.moveToOrigPosition();
    } else {
      card.moveToOrigPosition();
    }
  };

  card.sprite
    .on('touchstart', onTouchStart)
    .on('touchmove', onTouchMove)
    .on('touchend', onTouchEnd)
    .on('touchendoutside', onTouchEnd)
    .on('touchcancel', onTouchEnd);
}

/**
 * Scores the given card set.
 * @param {string} goal
 * @param {Array.<Card>} cardSet
 */
/*
function scoreCardSet(goal: string, cardSet: Card[]) {
  // Remove matching cards.
  state.cardSlots.filter(slot => slot.present)
    .forEach(slot => {
      const card = cardSet.find(card => card === slot.card);
      if (card) {
        card.moveToScoreButton();
        slot.present = false;
      }
    });

  // If the goal matches, we show a dialog.
  if (goal === state.goal) {
    PlaybookBridge.showTrophyAcquiredDialog();
  }

  // Send score and achievement to server.
  reportScore(GoalTypesMetadata[goal].score);
  reportGoal(goal);

  // Update score.
  state.score = state.score + GoalTypesMetadata[goal].score;

  // We need to delay the execution of this so that animation completes.
  const delayTime = new PIXI.action.DelayTime(0.25);
  const callFunc = new PIXI.action.CallFunc(() => {
    if (!GoalTypesMetadata[goal].isHidden) {
      createRandomGoal();
    } else {
      checkIfGoalMet();
    }
  });
  const sequence = new PIXI.action.Sequence([delayTime, callFunc]);
  PIXI.actionManager.runAction(stage, sequence);
}
*/

/**
 * Checks if the given goal is met.
 */
function checkIfGoalMet() {
  const cardSet = state.cardSlots
    .filter(slot => slot.present)
    .map(slot => slot.card);
  const goalsContainer = stage.getChildByName('v4GoalsContainer') as PIXI.Container;
  for (const goal of goalsContainer.children as V4Goal[]) {
    const goalCards = goal.satisfiedBy(cardSet as ICard[]);
    goal.active = goalCards.length > 0;
  }
}

/**
 * Assigns the card to a specific slot.
 * @param {Card} card
 * @param {number} slot
 */
function assignCardToSlot(card: Card, slot: number) {
  // Check if card exists in existing slot.
  const existingSlot = state.cardSlots.filter(slot => slot.present)
    .find(slot => slot.card === card);
  if (existingSlot !== undefined) {
    existingSlot.present = false;
    existingSlot.card = null;
  }

  // Copy card into slot list.
  state.cardSlots[slot].card = card;
  state.cardSlots[slot].present = true;
  if (card === state.activeCard) {
    state.activeCard = null;
  }

  card.moveToSlot(slot);
  card.isActive = false;

  // Trigger an update.
  state.cardSlots = state.cardSlots.slice();
}

/**
 * Discards a given card.
 * @param {Card} card
 */
function discardCard(card: Card) {
  if (state.activeCard === card) {
    stage.removeChild(state.activeCard.sprite);
    state.activeCard = null;
  } else {
    const slot = state.cardSlots.find((slot: CardSlot) => slot.card === card);
    if (slot === undefined) {
      console.warn('Attempting to discard card that doesn\'t exist in slot!');
      return;
    }

    slot.present = false;
    stage.removeChild(slot.card!.sprite);
    slot.card = null;

    // Notify listeners that the slots have been updated.
    state.cardSlots = state.cardSlots.slice();
  }

  renderer.markDirty();
}

/**
 * Given a point in world space, returns a possible drag target.
 * @param {Card} card
 * @param {PIXI.Point} position
 * @returns {PIXI.Sprite?}
 */
function getTargetByPoint(card: Card, position: PIXI.Point) : any {
  const discard = stage.getChildByName('discard');
  const tray = stage.getChildByName('tray');
  const v4GoalsContainer = stage.getChildByName('v4GoalsContainer') as PIXI.Container;

  for (const goal of v4GoalsContainer.children) {
    if (goal.getBounds().contains(position.x, position.y)) {
      return goal;
    }
  }

  if (discard.getBounds().contains(position.x, position.y) || position.y < 0) {
    return discard; //discard
  } else if (tray.getBounds().contains(position.x, position.y)) {
    return getNearestSlot(card, position);
  }
}

/**
 * Creates a random goal.
 */
/*
function createRandomGoal() {
  // Only set visible goals.
  const visibleGoals = Object.keys(GoalTypesMetadata)
    .filter(goal => !GoalTypesMetadata[goal].isHidden);
  const randomChoice = Math.floor((Math.random() * visibleGoals.length));
  state.goal = visibleGoals[randomChoice];
}
*/

/**
 * Updates the given goal sprite with the given goal.
 * @param {string} goal
 * @param {PIXI.Sprite} goalSprite
 */
/*
function setActiveGoal(goal: IGoalTypeMetadata, goalSprite: PIXI.Sprite) {
  const newTexture = PIXI.loader.resources[`resources/${goal.file}`].texture;
  goalSprite.texture = newTexture;
  renderer.markDirty();

  // Invalidate.
  checkIfGoalMet();
}
*/

function handleIncomingMessage(message: any) {
  switch (message.event) {
    case 'server:playsCreated':
      handlePlaysCreated(message.data);
      break;
    default:
  }
}

/**
 * Handles plays created event.
 * @param {Array.<number>} events
 */
function handlePlaysCreated(events: number[]) {
  const plays = events.map(PlaybookEvents.getById);
  for (const play of plays) {
    state.incomingCards.push(play);
    state.incomingCards = state.incomingCards.slice();
    renderer.markDirty();
  }
}

/**
 * Receives a card from the server.
 * @param {string} play
 */
function receiveCard(play: string) {
  const card = createCard(play);
  if (!card) { return; }

  state.activeCard = card;
  card.isActive = true;
  const cardNode = card.sprite;

  const cardScale = window.innerWidth / card.sprite.texture.width * 0.5;

  // Animate the appearance of the card.
  const fadeIn = new PIXI.action.FadeIn(0.5);
  const scaleTo = new PIXI.action.ScaleTo(cardScale, cardScale, 0.5);
  PIXI.actionManager.runAction(cardNode, fadeIn);
  PIXI.actionManager.runAction(cardNode, scaleTo);

  // Save these so that the animations can use them later.
  card.dragOrigPosition = new PIXI.Point(cardNode.position.x, cardNode.position.y);
  card.dragOrigRotation = cardNode.rotation;
  card.dragOrigScale = cardScale;

  initCardEvents(card);
}

/**
 * Creates a card on the screen.
 * @param {string} play
 * @param {boolean?} isActive
 * @param {number?} slot
 * @returns {Card}
 */
function createCard(play: string, isActive: boolean = true, slot?: number) : Card | null {
  const team = PlaybookEventsTeams[play];
  let teamString;
  switch (team) {
    case 'FIELDING':
      teamString = 'F-';
      break;
    case 'BATTING':
      teamString = 'B-';
      break;
    default:
      return null;
  }

  const mapString = PlaybookEventsStringMap[play];
  const cardTexture = PIXI.loader.resources[`resources/cards/Card-${teamString}${mapString}.jpg`].texture;

  const card = new PIXI.Sprite(cardTexture);
  card.anchor.set(0.5, 0.5);
  if (isActive) {
    card.position.set(window.innerWidth / 2, window.innerHeight / 2);
    card.scale.set(0, 0);
    card.rotation = PIXI.DEG_TO_RAD * (Math.floor(Math.random() * 10) + -5);
  } else {
    if (slot !== undefined) {
      const position = getCardPositionForSlot(cardTexture, slot);
      const scale = getCardScaleInSlot(cardTexture);
      card.position.set(position.x, position.y);
      card.scale.set(scale, scale);
    } else {
      console.error('Card marked as non-active, but slot is not passed!');
      return null;
    }
  }

  const cardObj = new Card(team, play, card);
  cardObj.sprite = card;
  state.cards.push(card);
  stage.addChild(card);

  return cardObj;
}
/**
 * Sets up the renderer. Adjusts the renderer according to the size of the
 * viewport, and adds it to the DOM tree.
 * @param {PIXI.WebGLRenderer} renderer
 */
function configureRenderer(renderer: PlaybookRenderer) {
  const resizeToFitWindow = function (renderer: PlaybookRenderer) {
    renderer.renderer.resize(window.innerWidth, window.innerHeight);
  };

  renderer.renderer.view.style.position = 'absolute';
  renderer.renderer.view.style.display = 'block';
  renderer.renderer.autoResize = true;
  resizeToFitWindow(renderer);
  document.body.appendChild(renderer.renderer.view);
  window.addEventListener('resize', () => {
    resizeToFitWindow(renderer);
  });
};

/**
 * Sets up the WebSocket connection.
 * @param {WebSocket} connection
 */
function configureWebSocket(connection: WebSocket) {
  connection.addEventListener('open', function () {
    console.log(`Connected to ${connection.url}`);
  });

  // TODO: Use more stringent type check here.
  connection.addEventListener('message', function (message: any) {
    message = JSON.parse(message.data);
    handleIncomingMessage(message);
  });
};

/**
 * Sets up web fonts.
 * @param {Array.<string>} fonts
 * @returns {Promise}
 */
function configureFonts(fonts: string[]) {
  // Load the required font files.
  return Promise.all(fonts.map(font => new FontFaceObserver(font).load()));
}

/**
 * Returns the card's position given a slot number.
 * @param {PIXI.Texture} cardTexture
 * @param {number} i
 */
function getCardPositionForSlot(cardTexture: PIXI.Texture, i: number) {
  const trayScale = stage.getChildByName('tray').scale.x;
  const cardScale = getCardScaleInSlot(cardTexture);
  const scaledWidth = cardTexture.width * cardScale;
  const scaledHeight = cardTexture.height * cardScale;
  return new PIXI.Point(
    (48.0 * trayScale) + (i * 24.0 * trayScale) + // Left margin and slot margins
    (i + 0.5) * scaledWidth, // Space occupied by slot,
    window.innerHeight - ((48.0 * trayScale) + (scaledHeight * 0.5))
  );
};

/**
 * Returns the scale of a card in a slot.
 * @param {PIXI.Texture} cardTexture
 */
function getCardScaleInSlot(cardTexture: PIXI.Texture) {
  const trayScale = stage.getChildByName('tray').scale.x;
  const cardHolderWidth = (window.innerWidth - (48.0 * trayScale * 2) - ((5/*NUM_SLOTS*/ - 1) * 24.0 * trayScale)) / 5.0;
  return cardHolderWidth / cardTexture.width;
}

/**
 * Returns the nearest available card slot.
 * @param {Card} card
 * @param {PIXI.Point} position
 * @returns {number?}
 */
function getNearestSlot(card: Card, position: PIXI.Point) {
  let slot = null;
  let smallestDistance = Number.MAX_VALUE;
  state.cardSlots.forEach((cardSlot, i) => {
    if (!cardSlot.present) {
      const slotPosition = getCardPositionForSlot(card.sprite.texture, i);
      const dist = distance(slotPosition, position);
      if (dist < smallestDistance) {
        slot = i;
        smallestDistance = dist;
      }
    }
  });

  return slot;
}

/**
 * Computes the distance between two points.
 * @param {PIXI.Point} p1
 * @param {PIXI.Point} p2
 * @returns {number}
 */
function distance(p1: PIXI.Point, p2: PIXI.Point) {
  const disx = Math.pow(p1.x - p2.x, 2);
  const disy = Math.pow(p1.y - p2.y, 2);
  return (Math.sqrt(disx + disy));
}

/**
 * Initializes events for the score bar.
 * @param {PIXI.extras.TilingSprite} scoreBar
 */
function initScoreBarEvents(scoreBar: PIXI.extras.TilingSprite) {
  scoreBar.interactive = true;
  scoreBar.on('tap', () => {
    PlaybookBridge.goToLeaderboard();
  });
}

/**
 * Initializes events for the score.
 * @param {PIXI.Text} scoreText
 */
function initScoreEvents(scoreText: PIXI.Text) {
  state.emitter.on(state.EVENT_SCORE_CHANGED, function (score: number, oldScore: number) {
    scoreText.text = ('000000' + score).substr(-Math.max(score.toString().length, 3));

    if (oldScore !== null) {
      const origScale = scoreText.scale.x;
      scoreText.scale.set(origScale * 3, origScale * 3);
      scoreText.alpha = 0;

      const scaleTo = new PIXI.action.ScaleTo(origScale, origScale, 0.5);
      const fadeIn = new PIXI.action.FadeIn(0.5);
      PIXI.actionManager.runAction(scoreText, scaleTo);
      PIXI.actionManager.runAction(scoreText, fadeIn);
    }
  });
}

/**
 * Initializes events for the goals container.
 */
function initV4GoalsContainerEvents(container: PIXI.Container) {
  state.emitter.on(state.EVENT_CARD_SLOTS_CHANGED, function (slots: CardSlot[]) {
    checkIfGoalMet();
    renderer.markDirty();
  });

  state.emitter.on(state.EVENT_SELECTED_GOAL_CHANGED, (goal: string) => {
    const container = stage.getChildByName('v4GoalsContainer') as PIXI.Container;
    const goalTile = container.children.find((goalTile: V4Goal) => {
      return goal === goalTile.info.goal;
    }) as V4Goal;

    console.assert(goalTile !== undefined);

    const cardSet = state.cardSlots
      .filter(slot => slot.present)
      .map(slot => slot.card) as ICard[];
    const satisfiedSet = goalTile.satisfiedBy(cardSet);
    if (satisfiedSet.length > 0) {
      satisfiedSet.forEach(card => card.sprite.tint = goalTile.info.backgroundColor);
    } else {
      cardSet.forEach(card => card.sprite.tint = 0xffffff);
    }
    renderer.markDirty();
  });
}

/**
 * Report a scoring event to the server.
 * @param {number} score
 */
/*
function reportScore(score: number) {
  const request = new XMLHttpRequest();
  request.open('POST', `${PlaybookBridge.getSectionAPIUrl()}/updateScore`);
  request.setRequestHeader('Content-Type', 'application/json');
  request.send(JSON.stringify({
    cat: 'collect',
    collectScore: score,
    id: PlaybookBridge.getPlayerID()
  }));
}
*/

/**
 * Reports a trophy achievement to the server.
 * @param {string} goal
 */
/*
function reportGoal(goal: string) {
  const request = new XMLHttpRequest();
  request.open('POST', `${PlaybookBridge.getSectionAPIUrl()}/updateTrophy`);
  request.setRequestHeader('Content-Type', 'application/json');
  request.send(JSON.stringify({
    trophyId: GoalTypesMetadata[goal].serverId,
    userId: PlaybookBridge.getPlayerID()
  }));
}
*/

/**
 * Initializes events for the score bar.
 */
function initTrayTipEvents(trayTip: PIXI.DisplayObject) {
  state.emitter.on(state.EVENT_ACTIVE_CARD_CHANGED, (activeCard?: Card) => {
    trayTip.visible = activeCard !== null;
  });
}

function setup() {
  // Add background to screen.
  const bgTexture = PIXI.loader.resources['resources/Collection-BG-Wood.jpg'].texture;
  const bg = new PIXI.Sprite(bgTexture);
  bg.scale.x = window.innerWidth / bgTexture.width;
  bg.scale.y = window.innerHeight / bgTexture.height;
  stage.addChild(bg);

  // Add card tray to screen.
  const trayTexture = PIXI.loader.resources['resources/Collection-Tray-9x16.png'].texture;
  const tray = new PIXI.Sprite(trayTexture);
  const trayScale = window.innerWidth / trayTexture.width;
  const trayHeight = trayScale * trayTexture.height;
  tray.name = 'tray';
  tray.position.set(0, window.innerHeight - trayHeight);
  tray.scale.set(trayScale, trayScale);
  //_tray = tray;
  stage.addChild(tray);

  // Use the tray scale as a scaling baseline.
  contentScale = tray.scale.x;

  // Add a small brighter green edge.
  const trayEdge = new PIXI.Graphics();
  const trayEdgeHeight = 6.0 * contentScale;
  trayEdge.beginFill(0x00bf00);
  trayEdge.drawRect(0, 0, window.innerWidth, trayEdgeHeight);
  trayEdge.endFill();
  trayEdge.name = 'trayEdge';
  trayEdge.position.set(0, window.innerHeight - trayHeight - trayEdgeHeight);
  stage.addChild(trayEdge);

  // Add score bar
  const scoreBarTexture = PIXI.loader.resources['resources/Collection-Bar-Gold-9x16.png'].texture;
  const scoreBarHeight = scoreBarTexture.height * contentScale;
  const scoreBar = new PIXI.extras.TilingSprite(scoreBarTexture, window.innerWidth, scoreBarHeight);
  scoreBar.name = 'scoreBar';
  scoreBar.position.set(0, window.innerHeight - trayHeight - scoreBarHeight);
  scoreBar.tileScale.set(1.0, contentScale);
  initScoreBarEvents(scoreBar);
  stage.addChild(scoreBar);

  // Add score bar shadow
  const scoreBarShadowTexture = PIXI.loader.resources['resources/Collection-Shadow-9x16.png'].texture;
  const scoreBarShadowHeight = scoreBarHeight;
  const scoreBarShadow = new PIXI.extras.TilingSprite(scoreBarShadowTexture, window.innerWidth, scoreBarHeight);
  scoreBarShadow.name = 'shadow';
  scoreBarShadow.position.set(0, window.innerHeight - trayHeight - scoreBarShadowHeight);
  scoreBarShadow.tileScale.set(1, contentScale);
  stage.addChild(scoreBarShadow);

  //Add score label
  /** @type {PIXI.Text} */
  const scoreBarText = new PIXI.Text();
  scoreBarText.position.set(16, scoreBarShadowHeight / 4);
  scoreBarText.text = 'Score:'.toUpperCase();
  scoreBarText.style.fontFamily = 'proxima-nova-excn';
  scoreBarText.style.fill = 0xffffff;
  scoreBarText.style.fontWeight = '900';
  scoreBarText.style.fontSize = 104 * contentScale;
  const scoreBarTextMetrics = PIXI.TextMetrics.measureText(scoreBarText.text, scoreBarText.style);
  scoreBarText.position.set(64 * contentScale, (scoreBarTexture.height - scoreBarTextMetrics.height / contentScale) * contentScale / 2);
  scoreBarShadow.addChild(scoreBarText);

  // Add score
  const scoreBarScore = new PIXI.Text();
  scoreBarScore.text = '000';
  scoreBarScore.style.fontFamily = 'SCOREBOARD';
  scoreBarScore.style.fill = 0xffffff;
  scoreBarScore.style.fontSize = 104 * contentScale;
  const scoreBarScoreMetrics = PIXI.TextMetrics.measureText(scoreBarScore.text, scoreBarScore.style);
  scoreBarScore.name = 'scoreBarScore';
  scoreBarScore.position.set(64 * 2 * contentScale + scoreBarTextMetrics.width, (scoreBarTexture.height - scoreBarScoreMetrics.height / contentScale) * contentScale / 2);
  initScoreEvents(scoreBarScore);
  scoreBarShadow.addChild(scoreBarScore);

  // Add bottom shadow
  const bottomShadowTexture = PIXI.loader.resources['resources/Collection-Shadow-9x16.png'].texture;
  const bottomShadowHeight = bottomShadowTexture.height * contentScale;
  const bottomShadow = new PIXI.extras.TilingSprite(bottomShadowTexture, window.innerWidth, bottomShadowHeight);
  bottomShadow.name = 'bottomShadow';
  bottomShadow.anchor.set(0.0, 1.0);
  bottomShadow.tileScale.set(1.0, contentScale);
  stage.addChild(bottomShadow);

  // Add goals section.
  const whiteBannerHeight = 32.0 * contentScale;
  const v4GoalsContainerHeight = window.innerHeight - trayHeight - whiteBannerHeight - scoreBarHeight;
  const v4GoalsContainer = new PIXI.Container();
  v4GoalsContainer.name = 'v4GoalsContainer';
  v4GoalsContainer.position.set(0.0, whiteBannerHeight);
  initV4GoalsContainerEvents(v4GoalsContainer);
  stage.addChild(v4GoalsContainer);

  const v4GoalWidth = (window.innerWidth - 192.0 * contentScale) / 2;
  const v4GoalHeight = (v4GoalsContainerHeight - 192.0 * contentScale) / 2;
  const v4GoalsInfo = [{
    position: new PIXI.Point(64.0 * contentScale, 64.0 * contentScale),
    backgroundColor: 0xff9f40,
    textColor: 0x402000,
    goal: GoalTypes.EACH_COLOR_2,
    showTrophy: false
  }, {
    position: new PIXI.Point(128.0 * contentScale + v4GoalWidth, 64.0 * contentScale),
    backgroundColor: 0xbfcad8,
    textColor: 0x303740,
    goal: GoalTypes.TWO_PAIRS,
    showTrophy: false
  }, {
    position: new PIXI.Point(64.0 * contentScale, 128.0 * contentScale + v4GoalHeight),
    backgroundColor: 0xffc300,
    textColor: 0x403100,
    goal: GoalTypes.FULL_HOUSE,
    showTrophy: false
  }, {
    position: new PIXI.Point(128.0 * contentScale + v4GoalWidth, 128.0 * contentScale + v4GoalHeight),
    backgroundColor: 0xffffff,
    textColor: 0x806200,
    goal: GoalTypes.UNKNOWN,
    showTrophy: true
  }];

  v4GoalsInfo.forEach(info => {
    const v4Goal = new V4Goal(state, contentScale!, {
      width: v4GoalWidth,
      height: v4GoalHeight
    }, info);
    v4GoalsContainer.addChild(v4Goal);
  });

  // Add "drag plays down to make sets".
  const trayTip = new PIXI.Graphics();
  const trayTipHeight = 110.0 * contentScale;
  trayTip.beginFill(0x000000, 0.5);
  trayTip.drawRect(0, 0, window.innerWidth, window.innerHeight - trayHeight - trayTipHeight);
  trayTip.endFill();
  trayTip.beginFill(0x00bf00);
  trayTip.drawRect(
    0, window.innerHeight - trayHeight - trayTipHeight,
    window.innerWidth, trayEdgeHeight
  );
  trayTip.endFill();
  trayTip.beginFill(0x007f00);
  trayTip.drawRect(
    0, window.innerHeight - trayHeight - trayTipHeight + trayEdgeHeight,
    window.innerWidth, trayTipHeight
  );
  trayTip.endFill();
  trayTip.name = 'trayTip';
  trayTip.visible = false;
  initTrayTipEvents(trayTip);
  stage.addChild(trayTip);

  const trayTipShadowTexture = PIXI.loader.resources['resources/Collection-Shadow-9x16.png'].texture;
  const trayTipShadowHeight = trayTipShadowTexture.height * contentScale;
  const trayTipShadow = new PIXI.extras.TilingSprite(trayTipShadowTexture, window.innerWidth, trayTipShadowHeight);
  trayTipShadow.name = 'trayTipShadow';
  trayTipShadow.anchor.set(0.0, 1.0);
  trayTipShadow.tileScale.set(1.0, contentScale);
  trayTip.addChild(trayTipShadow);

  const trayTipText = new PIXI.Text('Drag Cards Down to Make Sets'.toUpperCase());
  trayTipText.position.set(
    window.innerWidth / 2,
    (window.innerHeight - trayHeight - trayTipHeight) + trayTipHeight / 2 + trayEdgeHeight
  );
  trayTipText.anchor.set(0.5, 0.5);
  trayTipText.style.fontFamily = 'proxima-nova-excn';
  trayTipText.style.fill = 0xffffff;
  trayTipText.style.fontWeight = '900';
  trayTipText.style.fontSize = 104 * contentScale;
  trayTip.addChild(trayTipText);

  // Add Drag to Discard Banner
  const discard = new PIXI.Graphics();
  const discardHeight = 128.0 * contentScale;
  discard.beginFill(0xffffff);
  discard.drawRect(0, 0, window.innerWidth, whiteBannerHeight);
  discard.endFill();
  discard.beginFill(0x002b65);
  discard.drawRect(0, whiteBannerHeight, window.innerWidth, discardHeight);
  discard.name = 'discard';
  stage.addChild(discard);

  // Add top shadow
  const topShadowTexture = PIXI.loader.resources['resources/Collection-Shadow-Overturn.png'].texture;
  const topShadowHeight = topShadowTexture.height * contentScale;
  const topShadow = new PIXI.extras.TilingSprite(topShadowTexture, window.innerWidth, topShadowHeight);
  topShadow.name = 'shadowTop';
  topShadow.anchor.set(0.0, 0.0);
  topShadow.position.set(0, whiteBannerHeight + discardHeight);
  topShadow.tileScale.set(1.0, contentScale);
  stage.addChild(topShadow);

  // Add discard label
  const discardText = new PIXI.Text();
  discardText.position.set(window.innerWidth / 2, whiteBannerHeight + discardHeight / 2);
  discardText.anchor.set(0.5, 0.5);
  discardText.text = 'drag cards up to discard'.toUpperCase();
  discardText.style.fontFamily = 'proxima-nova-excn';
  discardText.style.fill = 0xffffff;
  discardText.style.fontWeight = '900';
  discardText.style.fontSize = 104 * contentScale;
  discardText.style.align = 'center';
  discard.addChild(discardText);

  /**
   * Begin the animation loop.
   * @param {DOMHighResTimeStamp} now
   */
  function beginDrawLoop(now: number) {
    const numPendingActions = Object.keys(PIXI.actionManager.actions).length;
    if (numPendingActions > 0) {
      renderer.markDirty();
    }

    // Check if we have cards pending in the queue.
    if (state.activeCard === null && state.incomingCards.length > 0) {
      const play = state.incomingCards.pop();
      state.incomingCards = state.incomingCards.slice();
      receiveCard(play!);
    }

    // For mobile phones, we don't go full-blast at 60 fps.
    // Re-render only if dirty.
    if (renderer.dirty) {
      PIXI.actionManager.update((now - lastRenderTime) / 1000);
      renderer.render(stage);
    }

    lastRenderTime = now;
    requestAnimationFrame(beginDrawLoop);
  };

  let lastRenderTime = performance.now();
  renderer.markDirty();
  PlaybookBridge.notifyLoaded(state);
  beginDrawLoop(lastRenderTime);
};

// Create and configure the renderer.
configureRenderer(renderer);
configureWebSocket(connection);

// Load the sprites we need.
configureFonts(['proxima-nova-excn', 'SCOREBOARD'])
  .then(() => {
    PIXI.loader
      .add('resources/Collection-BG-Wood.jpg')
      .add('resources/Collection-Tray-9x16.png')
      .add('resources/Collection-Star-9x16.png')
      .add('resources/Collection-Bar-Gold-9x16.png')
      .add('resources/Collection-Bar-Green-9x16.png')
      .add('resources/Collection-Bar-Yellow-9x16.png')
      .add('resources/Collection-Shadow-9x16.png')
      .add('resources/Collection-Shadow-Overturn.png')
      .add('resources/trophy/empty.png')
      .add('resources/trophy/trophy1.png')
      .add('resources/trophy/trophy2.png')
      .add('resources/trophy/trophy3.png')
      .add('resources/trophy/trophy4.png')
      .add('resources/trophy/trophy5.png')
      .add('resources/trophy/trophy6.png')
      .add('resources/trophy/trophy7.png')
      .add('resources/trophy/trophy8.png')
      .add('resources/trophy/trophy9.png')
      .add('resources/trophy/trophy10.png')
      .add('resources/trophy/trophy11.png')
      .add('resources/trophy/trophy12.png')
      .add('resources/trophy/trophy13.png')
      .add('resources/trophy/trophy14.png')
      .add('resources/trophy/trophy15.png')
      .add('resources/Collection-Example-2.png')
      .add('resources/Collection-Example-2-2.png')
      .add('resources/Collection-Example-2-3.png')
      .add('resources/Collection-Example-3.png')
      .add('resources/Collection-Example-4.png')
      .add('resources/Collection-Example-5.png')
      .add('resources/cards/Card-B-FirstBase.jpg')
      .add('resources/cards/Card-B-GrandSlam.jpg')
      .add('resources/cards/Card-B-HitByPitch.jpg')
      .add('resources/cards/Card-B-HomeRun.jpg')
      .add('resources/cards/Card-B-RunScored.jpg')
      .add('resources/cards/Card-B-SecondBase.jpg')
      .add('resources/cards/Card-B-Steal.jpg')
      .add('resources/cards/Card-B-ThirdBase.jpg')
      .add('resources/cards/Card-B-Walk.jpg')
      .add('resources/cards/Card-F-BlockedRun.jpg')
      .add('resources/cards/Card-F-DoublePlay.jpg')
      .add('resources/cards/Card-F-FieldersChoice.jpg')
      .add('resources/cards/Card-F-FlyOut.jpg')
      .add('resources/cards/Card-F-GroundOut.jpg')
      .add('resources/cards/Card-F-LongOut.jpg')
      .add('resources/cards/Card-F-PickOff.jpg')
      .add('resources/cards/Card-F-Strikeout.jpg')
      .add('resources/cards/Card-F-TriplePlay.jpg')
      .add('resources/cards/Card-F-UnopposedStrikeout.jpg')
      .load(setup);
  });
