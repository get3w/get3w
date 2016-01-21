package storage

import (
	"path/filepath"
	"strings"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// LoadSiteSections load sections for current site
func (parser *Parser) LoadSiteSections(loadDefault bool) {
	parser.Current.Sections = []*get3w.Section{}

	sectionMap := make(map[string]*get3w.Section)
	files, err := parser.Storage.GetFiles(parser.prefix(PrefixSections))
	if err != nil {
		return
	}

	for _, file := range files {
		ext := filepath.Ext(file.Path)
		if ext != ExtHTML && ext != ExtCSS && ext != ExtJS {
			continue
		}
		sectionName := strings.Replace(file.Name, ext, "", 1)
		section := sectionMap[sectionName]
		if section == nil {
			section = &get3w.Section{
				ID:   stringutils.Base64ForURLEncode(sectionName),
				Name: sectionName,
			}
		}
		if ext == ExtHTML {
			section.HTML, _ = parser.ReadSectionContent(file)
		} else if ext == ExtCSS {
			section.CSS, _ = parser.ReadSectionContent(file)
		} else if ext == ExtJS {
			section.JS, _ = parser.ReadSectionContent(file)
		}

		sectionMap[sectionName] = section
	}

	if loadDefault {
		for _, section := range parser.Default.Sections {
			if _, ok := sectionMap[section.Name]; !ok {
				sectionMap[section.Name] = section
			}
		}
	}

	for _, section := range sectionMap {
		parser.Current.Sections = append(parser.Current.Sections, section)
	}
}

// sectionKey get html file key by sectionName
func (parser *Parser) sectionKey(relatedURL string) string {
	return parser.key(PrefixSections, relatedURL)
}

// ReadSectionContent get section file content
func (parser *Parser) ReadSectionContent(file *get3w.File) (string, error) {
	keyName := parser.sectionKey(file.Name)
	str, err := parser.Storage.Read(keyName)
	if err != nil {
		return "", err
	}

	return string(str), nil
}

// SaveSection write content to section
func (parser *Parser) SaveSection(section *get3w.Section) error {
	htmlKey := parser.sectionKey(section.Name + ExtHTML)
	if section.HTML != "" {
		if err := parser.Storage.Write(htmlKey, []byte(section.HTML)); err != nil {
			return err
		}
	} else {
		if err := parser.Storage.Delete(htmlKey); err != nil {
			return err
		}
	}

	cssKey := parser.sectionKey(section.Name + ExtCSS)
	if section.CSS != "" {
		if err := parser.Storage.Write(cssKey, []byte(section.CSS)); err != nil {
			return err
		}
	} else {
		if err := parser.Storage.Delete(cssKey); err != nil {
			return err
		}
	}

	jsKey := parser.sectionKey(section.Name + ExtJS)
	if section.JS != "" {
		if err := parser.Storage.Write(jsKey, []byte(section.JS)); err != nil {
			return err
		}
	} else {
		if err := parser.Storage.Delete(jsKey); err != nil {
			return err
		}
	}

	return nil
	// 	previewHTML := `<!DOCTYPE html>
	// <html lang="en">
	// <head>
	//     <meta charset="utf-8">
	//     <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
	//     <meta name="viewport" content="width=device-width, initial-scale=1">
	//     <title>` + section.Name + `</title>
	//     <link href="http://cdn.get3w.com/assets/css/font-awesome/4.4.0/css/font-awesome.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/animate.css/3.4.0/animate.min.css" rel="stylesheet">
	//     <link href="http://cdn.get3w.com/assets/css/csstoolkits/0.0.1/ct.min.css" rel="stylesheet">
	//     <link href="` + section.Name + `.css" rel="stylesheet">
	// </head>
	// <body>
	// <section class="this">
	//     ` + section.HTML + `
	// </section>
	// <script src="` + section.Name + `.js"></script>
	// </body>
	// </html>`
	// 	parser.WritePreview(parser.getSectionKey(section.Name+parser.ExtHTML), []byte(previewHTML))
}

// DeleteSection delete section files
func (parser *Parser) DeleteSection(sectionName string) error {
	if err := parser.Storage.Delete(parser.sectionKey(sectionName + ExtHTML)); err != nil {
		return err
	}
	if err := parser.Storage.Delete(parser.sectionKey(sectionName + ExtCSS)); err != nil {
		return err
	}
	if err := parser.Storage.Delete(parser.sectionKey(sectionName + ExtJS)); err != nil {
		return err
	}
	return nil
}

func getSection(sectionName string, sections []*get3w.Section) *get3w.Section {
	for _, section := range sections {
		if section.Name == sectionName {
			return section
		}
	}
	return nil
}
