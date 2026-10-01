<?php
/**
 * ForensIA - Punto de entrada en Vercel (runtime vercel-php)
 * ==========================================================
 * Vercel solo ejecuta funciones dentro de /api y no interpreta PHP por sí
 * mismo: vercel.json enruta TODAS las peticiones aquí y este archivo delega
 * en el front-controller (index.php), que atiende la API y sirve el
 * frontend, igual que Apache + .htaccess en XAMPP.
 */

// El runtime trae display_errors=1: los avisos no deben mezclarse con las respuestas JSON.
ini_set('display_errors', '0');

require __DIR__ . '/../index.php';
