import * as $rdf from 'rdflib';
import config_thmo from '$lib/config_thmo.json'

class Ontology {
    constructor(ontologyTTL, url) {
        this.g = $rdf.graph();
        const mimeType = 'text/turtle'
        try {
            $rdf.parse(ontologyTTL, this.g, url, mimeType)
            Object.entries(this.g.namespaces).forEach(([key,value]) => {
                this[key.toUpperCase()] = $rdf.Namespace(value);
            });
            this['SCHEMA'] = $rdf.Namespace('http://schema.org/')

            //this.attributes('Transition');
        } catch (err) {
            console.log(err)
        }
    }

    static async createInstance(url) {
        const data = await fetch(url);
        const ontologyTTL = await data.text();
        return new Ontology(ontologyTTL, url);
    }

    get size() {
        return this.countTriples();
    }

    countTriples() {
        return this.g.match(null,null,null).length;
    }

    hasRange(class_uri, range_uri) {
        return this.g.holds(class_uri, this.RDFS('range'), range_uri)
    }

    hasType(class_uri, type_uri) {
        return this.g.holds(class_uri, this.RDF('type'), type_uri)
    }

    getLabel(uri) {
        const label = this.g.any(uri, this.RDFS('label'), null);
        if (label) {
            return label.toString();
        }
        // TODO: handle error case
        return "";
    }

    getAttributeConfig(className, attrName) {
        return {value: config_thmo[className]?.[attrName] ?? true,
                fixed: config_thmo[className]?.fixed?.includes(attrName) ?? false}
    }

    attributes(className) {
        const node = this.THMO_CONCEPTS(className)
        const sc = this.g.each(node, this.RDFS('subClassOf'), null);
        const attr = {}

        sc.forEach(s => {
            if (this.hasType(s, this.OWL('Restriction'))) {
                const property = this.g.any(s, this.OWL('onProperty'), null);
                const range = this.g.any(property, this.RDFS('range'), null) || this.g.any(s, this.OWL('allValuesFrom'), null);
                const label = this.getLabel(property);
                if (property && 
                    this.hasRange(property, this.XSD('boolean')) &&
                    !(label in attr)) {
                    //console.log(label, this.getAttributeConfig(className, label))
                    const config_vals = this.getAttributeConfig(className, label);
                    attr[label] = {uri: property.uri, range: range.uri, ...config_vals}
                    //console.log(property.uri, this.g.any(property, this.RDFS('range')).uri, this.g.holds(property, this.RDFS('range'), this.XSD('boolean')), this.g.holds(property, this.OWL('allValuesFrom'), this.XSD('boolean')))
                }
            } 
        })

        return attr
    }

    isA(class_uri, super_uri) {
        const superClasses = this.g.each(class_uri, this.RDFS('subClassOf'), null);

        for (const sc of superClasses) {
            if (sc.equals(super_uri)) {
                return true;
            }
        }
        return false
    }

    variables(className) {
        //console.log("Collecting variables of ", className)
        const node = this.THMO_CONCEPTS(className)
        const sc = this.g.each(node, this.RDFS('subClassOf'), null);
        const vars = {}

        sc.forEach(s => {
            if (this.hasType(s, this.OWL('Restriction'))) {
                const property = this.g.any(s, this.OWL('onProperty'), null);
                const label = this.getLabel(property);
                const range = this.g.any(property, this.RDFS('range'), null) || this.g.any(s, this.OWL('allValuesFrom'), null);

                if (property && 
                    this.isA(range, this.THMO_CONCEPTS('Variable')) &&
                    !(label in vars)) 
                {
                    const name = this.getLabel(range);
                    const unit = this.g.any(range, this.SCHEMA('Unit'))?.toString();
                    
                    vars[label] = {uri: property.uri, 
                                   range: range.uri,
                                   name: name,
                                   value: NaN,
                                   unit: unit,
                                   active: false
                                }
                    //console.log(property.uri, unit?.toString(), range.uri, this.g.holds(property, this.RDFS('range')))
                }
            } 
        })

        return vars
    }
}

export default Ontology;