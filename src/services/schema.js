/**
 * @typedef {Object} FlashcardItem
 * @property {string} id
 * @property {"flashcard"} type
 * @property {string} front
 * @property {string} back
 */

/**
 * @typedef {Object} QuizItem
 * @property {string} id
 * @property {"quiz"} type
 * @property {string} question
 * @property {string[]} options    // exactly 4 strings
 * @property {number} correctIndex // 0-3
 * @property {string} explanation
 */

/**
 * @typedef {FlashcardItem | QuizItem} StudyItem
 */

/**
 * @typedef {Object} AIResponse
 * @property {StudyItem[]} items
 */

export const ITEM_TYPES = ["flashcard", "quiz"];
