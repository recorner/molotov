import axios from 'axios';

async function testLibreTranslate() {
  try {
    const response = await axios.post('http://localhost:5000/translate', {
      q: 'Hello, world!',
      source: 'en',
      target: 'es',
      format: 'text'
    });
    console.log('Translation result:', response.data.translatedText);
  } catch (error) {
    if (error.response) {
      console.error('Error response:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testLibreTranslate();
