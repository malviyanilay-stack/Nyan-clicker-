let score = 0;

const nyanCat = document.getElementById('nyanCat');
const scoreDisplay = document.getElementById('score');

nyanCat.addEventListener('click', () => {
    score++;
    scoreDisplay.textContent = score;
});
