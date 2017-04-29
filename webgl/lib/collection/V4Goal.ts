'use strict';
import * as PIXI from 'pixi.js';

import PlaybookEvents,
{
  Teams as PlaybookEventsTeams,
  IsOut as PlaybookEventsIsOut,
  IsOnBase as PlaybookEventsIsOnBase
} from '../PlaybookEvents';
import IGameState from './IGameState';
import GoalTypes from './GoalTypes';
import GoalTypesMetadata from './GoalTypesMetadata';
import Card from './ICard';

interface ContainerParams {
  height: number,
  width: number
}

interface V4GoalInfo {
  position: PIXI.Point,
  backgroundColor: number,
  textColor: number,
  goal: string,
  showTrophy: boolean
}

/**
 * Check if the given list of cards meets the goal.
 */
function cardSetMeetsGoal(cardSet: Card[], goal: string) : Card[] {
  const numOnBase = cardSet.filter(card => PlaybookEventsIsOnBase[card.play]).length;
  const numOut = cardSet.filter(card => (
    PlaybookEventsIsOut[card.play] &&
    card.play !== PlaybookEvents.TRIPLE_PLAY &&
    card.play !== PlaybookEvents.DOUBLE_PLAY
  )).length;
  const numRed = cardSet.filter(card => (PlaybookEventsTeams[card.play] === 'BATTING')).length;
  const numBlue = cardSet.filter(card => (PlaybookEventsTeams[card.play] === 'FIELDING')).length;
  const numDoublePlay = cardSet.filter(card => card.play === PlaybookEvents.DOUBLE_PLAY).length;
  const numTriplePlay = cardSet.filter(card => card.play === PlaybookEvents.TRIPLE_PLAY).length;

  const cardCounts: { [play: string]: number } = {};
  cardSet.forEach(card => {
    if (cardCounts[card.play] === undefined) {
      cardCounts[card.play] = 1;
    } else {
      cardCounts[card.play]++;
    }
  });

  let cardsMetGoal = new Array();

  switch (goal) {
    case GoalTypes.EACH_COLOR_2: {
      if (numBlue >= 2 && numRed >= 2) {
        const redCards = cardSet.filter(card => PlaybookEventsTeams[card.play] === 'BATTING').slice(0, 2);
        const blueCards = cardSet.filter(card => PlaybookEventsTeams[card.play] === 'FIELDING').slice(0, 2);
        return [...redCards, ...blueCards];
      }
      break;
    }
    case GoalTypes.TWO_PAIRS: {
      const plays = Object.keys(cardCounts).filter(play => cardCounts[play] >= 2);
      if (plays.length >= 2) {
        const firstPair = cardSet.filter(card => card.play === plays[0]).slice(0, 2);
        const secondPair = cardSet.filter(card => card.play === plays[1]).slice(0, 2);
        return [...firstPair, ...secondPair];
      } else if (plays.length === 1) {
        // It's also possible that two pairs are the same play.
        const play = plays[0];
        if (cardCounts[play] >= 4) {
          return cardSet.filter(card => card.play === play).slice(0, 4);
        }
      }
      break;
    }
    case GoalTypes.FULL_HOUSE: {
      const plays2 = Object.keys(cardCounts).find(play => cardCounts[play] === 2);
      const plays3 = Object.keys(cardCounts).find(play => cardCounts[play] === 3);
      if (plays2 !== undefined && plays3 !== undefined && plays2 !== plays3) {
        const cards2 = cardSet.filter(card => card.play === plays2);
        const cards3 = cardSet.filter(card => card.play === plays3);
        return [...cards2, ...cards3];
      }
      break;
    }
    case GoalTypes.SAME_COLOR_3: {
      if ((numBlue >= 3) || (numRed >= 3)) {
        if (numRed >= 3) {
          return cardSet.filter(card => (PlaybookEventsTeams[card.play] === 'BATTING'))
            .slice(0, 3);
        }
        else if ((numBlue >= 3)) {
          return cardSet.filter(card => (PlaybookEventsTeams[card.play] === 'FIELDING'))
            .slice(0, 3);
        }
      }
      break;
    }
    case GoalTypes.SAME_COLOR_4: {
      if ((numBlue >= 4) || (numRed >= 4)) {
        if (numRed >= 4) {
          return cardSet.filter(card => (PlaybookEventsTeams[card.play] === 'BATTING'))
            .slice(0, 4);
        }
        else if ((numBlue >= 4)) {
          return cardSet.filter(card => (PlaybookEventsTeams[card.play] === 'FIELDING'))
            .slice(0, 4);
        }
      }
      break;
    }
    case GoalTypes.SAME_COLOR_5: {
      if (numBlue === 5 || numRed === 5) {
        return cardSet;
      }
      break;
    }
    case GoalTypes.IDENTICAL_CARDS_3: {
      const plays = Object.keys(cardCounts).filter(play => cardCounts[play] >= 3);
      if (plays.length > 0) {
        return cardSet.filter(card => card.play === plays[0]).slice(0, 3);
      }
      break;
    }
    case GoalTypes.IDENTICAL_CARDS_4: {
      const plays = Object.keys(cardCounts).filter(play => cardCounts[play] >= 4);
      if (plays.length > 0) {
        return cardSet.filter(card => card.play === plays[0]).slice(0, 4);
      }
      break;
    }
    case GoalTypes.IDENTICAL_CARDS_5: {
      const plays = Object.keys(cardCounts).filter(play => cardCounts[play] === 5);
      if (plays.length > 0) {
        return cardSet.filter(card => card.play === plays[0]);
      }
      break;
    }
    case GoalTypes.OUT_3: { //I think should be exactly 3 outs, so 2 double plays can't satisfy
      const totalOuts = numOut + numDoublePlay * 2 + numTriplePlay * 3;
      if (totalOuts >= 3) {
        const triplePlay = cardSet.find(card => card.play === PlaybookEvents.TRIPLE_PLAY);
        if (triplePlay !== undefined) {
          return [ triplePlay ];
        } else if (numDoublePlay > 0) {
          const cardDoublePlay = cardSet.find(card => card.play === PlaybookEvents.DOUBLE_PLAY);
          const cardOut = cardSet.find(card => PlaybookEventsIsOut[card.play]);
          cardsMetGoal.push(cardDoublePlay);
          cardsMetGoal.push(cardOut);
          return cardsMetGoal;
        }
        else {
          return cardSet.filter(card => PlaybookEventsIsOut[card.play])
            .slice(0, 3);

        }
      }
      break;
    }
    case GoalTypes.UNIQUE_OUT_CARDS_3: {
      const uniqueOutPlays = Object.keys(cardCounts).filter(play => PlaybookEventsIsOut[play]);
      if (uniqueOutPlays.length === 3) {
        return uniqueOutPlays.map(play => cardSet.find(card => card.play === play) as Card);
      }
      break;
    }
    case GoalTypes.UNIQUE_OUT_CARDS_4: {
      const uniqueOutPlays = Object.keys(cardCounts).filter(play => PlaybookEventsIsOut[play]);
      if (uniqueOutPlays.length === 4) {
        return uniqueOutPlays.map(play => cardSet.find(card => card.play === play) as Card);
      }
    }
    case GoalTypes.BASES_3: {
      if (numOnBase >= 3) {
        return cardSet.filter(card => PlaybookEventsIsOnBase[card.play]);
      }
      break;
    }
    case GoalTypes.BASES_RBI_4: {
      const runScoredCard = cardSet.find(card => card.play === PlaybookEvents.RUN_SCORED);
      if (numOnBase >= 3 && runScoredCard !== undefined) {
        return [
          ...cardSet.filter(card => PlaybookEventsIsOnBase[card.play]),
          runScoredCard
        ];
      }
      break;
    }
    case GoalTypes.BASES_SEQ_3: {
      const sequences = [
        [PlaybookEvents.HIT_BY_PITCH, PlaybookEvents.SINGLE, PlaybookEvents.DOUBLE],
        [PlaybookEvents.WALK, PlaybookEvents.SINGLE, PlaybookEvents.DOUBLE],
        [PlaybookEvents.SINGLE, PlaybookEvents.DOUBLE, PlaybookEvents.TRIPLE],
        [PlaybookEvents.DOUBLE, PlaybookEvents.TRIPLE, PlaybookEvents.HOME_RUN],
      ];

      for (const sequence of sequences) {
        const outCards = sequence.map(play => cardSet.find(card => card.play === play));
        if (outCards.indexOf(undefined) < 0) {
          return outCards as Card[];
        }
      }
      break;
    }

    default:
      console.warn('Unknown goal', goal);
  }

  return cardsMetGoal;
}

class V4Goal extends PIXI.Container {
  _state: IGameState;
  _contentScale: number;
  _containerParams: ContainerParams;
  _info: V4GoalInfo;
  _active: boolean;

  _background: PIXI.Graphics;
  _label: PIXI.Text;
  _example: PIXI.Sprite;
  _score: PIXI.Text;
  _trophy: PIXI.Sprite;

  /**
   * Creates a goal tile.
   */
  constructor(state: IGameState, contentScale: number, containerParams: ContainerParams, info: V4GoalInfo) {
    super();

    this._state = state;
    this._contentScale = contentScale;
    this._containerParams = containerParams;
    this._info = info;
    this._active = false;

    this._initEvents();

    this._background = new PIXI.Graphics();
    this.addChild(this._background);

    // If the goal type is unknown, we need to assign a random goal.
    if (info.goal === GoalTypes.UNKNOWN) {
      const visibleGoals = Object.keys(GoalTypesMetadata)
        .filter(goal => !GoalTypesMetadata[goal].isHidden);
      const randomChoice = Math.floor((Math.random() * visibleGoals.length));
      info.goal = visibleGoals[randomChoice];
    }

    if (info.goal !== null) {
      this._label = new PIXI.Text(GoalTypesMetadata[info.goal].description);
      this.addChild(this._label);

      if (GoalTypesMetadata[info.goal].example !== null) {
          const texture = PIXI.loader.resources[`resources/${GoalTypesMetadata[info.goal].example}`].texture;
          this._example = new PIXI.Sprite(texture);
          this.addChild(this._example);
      }

      this._score = new PIXI.Text(GoalTypesMetadata[info.goal].score.toString());
      this.addChild(this._score);
    }

    const texture = PIXI.loader.resources['resources/trophy/empty.png'].texture;
    this._trophy = new PIXI.Sprite(texture);
    this.addChild(this._trophy);

    this.position.set(info.position.x, info.position.y);
    this._invalidate();
  }

  get info() {
    return this._info;
  }

  get active() {
    return this._active;
  }

  set active(value) {
    const oldValue = this._active;
    this._active = !!value;
    if (oldValue !== this._active) {
      this._invalidate();
    }
  }

  satisfiedBy(cardSet: Card[]) : Card[] {
    return cardSetMeetsGoal(cardSet, this._info.goal);
  }

  _initEvents() {
    this.interactive = true;
    this.on('tap', () => {
      this._state.selectedGoal = this._info.goal;
    });
  }

  _invalidate() {
    const contentScale = this._contentScale;
    const background = this._background;
    const info = this._info;
    const label = this._label;
    const example = this._example;
    const score = this._score;
    const trophy = this._trophy;

    background.clear();
    background.lineStyle(12.0 * contentScale, info.backgroundColor);

    if (this._active) {
      background.beginFill(info.backgroundColor);
      background.drawRoundedRect(0, 0, this._containerParams.width, this._containerParams.height, 64.0 * contentScale);
      background.endFill();
    } else {
      background.beginFill(info.backgroundColor, 0.0);
      background.drawRoundedRect(0, 0, this._containerParams.width, this._containerParams.height, 64.0 * contentScale);
      background.endFill();
    }

    if (this._info.showTrophy) {
      trophy.visible = true;
      trophy.texture = PIXI.loader.resources[`resources/${GoalTypesMetadata[info.goal].file}`].texture;
      trophy.scale.set(contentScale, contentScale);
      trophy.position.set(
        this._containerParams.width - trophy.width,
        this._containerParams.height - trophy.height
      );
    } else {
      trophy.visible = false;
    }

    if (info.goal !== null) {
      label.style.fontFamily = 'proxima-nova-excn';
      label.style.fontSize = 72.0 * contentScale;
      label.style.fill = this._active ? info.textColor : info.backgroundColor;
      label.style.align = 'center';
      label.anchor.set(0.5, 0.5);
      label.position.set(this._containerParams.width / 2, 64.0 * contentScale);

      if (GoalTypesMetadata[info.goal].example !== null) {
        example.tint = this._active ? info.textColor : info.backgroundColor;
        example.anchor.set(0.5, 0.5);
        example.position.set(this._containerParams.width / 2, this._containerParams.height / 2);
        example.scale.set(contentScale, contentScale);
      }

      score.style.fontFamily = 'SCOREBOARD';
      score.style.fontSize = 104.0 * contentScale;
      score.style.fill = this._active ? info.textColor : info.backgroundColor;
      score.position.set(
        64.0 * contentScale,
        this._containerParams.height - 64.0 * contentScale - score.height
      );
    }
  }
}

export default V4Goal;
