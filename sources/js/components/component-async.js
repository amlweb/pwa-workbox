import Component from 'sources/js/components/component';
import exampleTemplate from 'sources/templates/components/example.1.twig';

// Przykład dziedziczenia
class ComponentAsync extends Component {
    message = 'it\'s working from async!';
    
    constructor() {
        super();
        console.log(exampleTemplate());
    }
}

export default ComponentAsync;
