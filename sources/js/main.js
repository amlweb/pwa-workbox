// Przykład aliasu - ścieżki już nie muszą być relatywne
import Component from 'sources/js/components/component';
import exampleTemplate from 'sources/templates/components/example.twig';

// Przykład importowania koloru z css
import scss from 'scss';

class App {

    // Przykład property publicznej
    component = null;
    componentAsync = null;

    // Przykład property statycznej
    static appName = 'APP';

    constructor() {
        this.init();
    }

    init() {
        this.initComponent();
        this.initComponentAsync();
        this.initScssVariables();
        this.initTwigTemplate();
        this.initSpreadExample();
    }

    initComponent() {
        this.component = new Component();
        this.component.printMessage();
    }

    // Przykład ładowania komponentu asynchronicznie
    async initComponentAsync() {
        let ComponentAsync = (await import(/* webpackChunkName: "component-async" */ 'sources/js/components/component-async')).default;

        this.componentAsync = new ComponentAsync();
        this.componentAsync.printMessage();
    }

    // Przykład wykorzystania koloru z scss
    initScssVariables() {
        console.log('kolor $color-red z variables.scss: ' + scss['$color-red']);
    }

    initTwigTemplate() {
        console.log(exampleTemplate());
    }
    
    initSpreadExample() {
        let objAB = {a: 0, b: 3};
        let objABC = {...objAB, b: 1, c: 2};
    
        console.table({objAB, objABC});
    }
}

console.log(App.appName);

document.addEventListener('DOMContentLoaded', () => new App());
