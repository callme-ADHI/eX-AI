const REF = /\b(this|the|current|that)\s+(page|site|website|web ?site|article|tab|link|blog|docs?|documentation|post|section)\b|\babove\b|\bon (this|the) (page|site)\b|\bhere\b.*\b(say|mention|write|offer)\b/i;

export const refersToPage = (text: string): boolean => REF.test(text);
