import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Providers from './providers';
import { useTheme } from '@mui/material/styles';

describe('Providers Component', () => {
    it('renders children correctly', () => {
        render(
            <Providers>
                <div data-testid="child-element">Test Child</div>
            </Providers>
        );

        expect(screen.getByTestId('child-element')).toBeInTheDocument();
        expect(screen.getByText('Test Child')).toBeInTheDocument();
    });

    it('provides the correct MUI theme', () => {
        const ThemeTestComponent = () => {
            const theme = useTheme();
            return <div data-testid="theme-mode">{theme.palette.mode}</div>;
        };

        render(
            <Providers>
                <ThemeTestComponent />
            </Providers>
        );

        expect(screen.getByTestId('theme-mode')).toHaveTextContent('dark');
    });
});
