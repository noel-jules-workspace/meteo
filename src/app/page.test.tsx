import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Home from './page';

describe('Home Page', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders the main heading and description', () => {
        render(<Home />);

        expect(screen.getByText('Meteo Rose')).toBeInTheDocument();
        expect(screen.getByText(/Zero-Key Browser-ML Paragliding Weather Bias-Correction App/)).toBeInTheDocument();
    });

    it('renders links to the station pages', () => {
        render(<Home />);

        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(3);

        const fpsLink = links[0];
        expect(fpsLink).toHaveTextContent(/Flight Park South/i);
        expect(fpsLink.getAttribute('href')).toBe(`/${encodeURIComponent('us:fps')}`);

        const holfuyLink = links[1];
        expect(holfuyLink).toHaveTextContent(/Holfuy 263/i);
        expect(holfuyLink.getAttribute('href')).toBe(`/${encodeURIComponent('de:holfuy:263')}`);

        const pwsLink = links[2];
        expect(pwsLink).toHaveTextContent(/Wunderground PWS/i);
        expect(pwsLink.getAttribute('href')).toBe(`/${encodeURIComponent('de:IKOBER13')}`);
    });
});
