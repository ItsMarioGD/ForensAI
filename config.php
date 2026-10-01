<?php

// Pollinations API key (nunca se envía al navegador)
$pollinationsKeyEnv = getenv('POLLINATIONS_API_KEY');
define('POLLINATIONS_API_KEY', $pollinationsKeyEnv !== false && $pollinationsKeyEnv !== '' ? $pollinationsKeyEnv : 'sk_kDfvTu9c8OrixTn4mmAG6OfrjDVlhZUz');

define('POLLINATIONS_BASE_URL', 'https://gen.pollinations.ai');
define('POLLINATIONS_MODEL', 'openai');
define('POLLINATIONS_CHECK_TIMEOUT', 6);
// En Vercel la función se corta a los 60 s (maxDuration en vercel.json):
// se responde antes con un error claro en lugar de un 504 genérico.
define('POLLINATIONS_GENERATE_TIMEOUT', getenv('VERCEL') ? 55 : 180);

define('POLLINATIONS_RECOMMENDED_MODELS', [
    'openai',
    'gpt-5.4',
    'gpt-5.4-mini',
    'llama',
    'llama-maverick',
    'qwen-coder',
    'mistral',
    'deepseek',
    'gemini',
    'claude',
]);

define('APP_NAME', 'ForensIA');
define('APP_VERSION', '3.0.0-php-xampp');
