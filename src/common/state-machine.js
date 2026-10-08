import { ASSIGNMENT_TRANSITIONS } from '../config/constants.js';
import { conflict } from './errors.js';

export const canTransitionAssignment = (current, next) =>
  Boolean(ASSIGNMENT_TRANSITIONS[current]?.includes(next));

export const assertAssignmentTransition = (current, next) => {
  if (current === next) return false;
  if (!canTransitionAssignment(current, next)) {
    throw conflict(`Assignment cannot move from ${current} to ${next}`);
  }
  return true;
};
