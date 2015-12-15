package storage

import (
	"fmt"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

func getLang(line string) *get3w.Lang {
	arrOuter := regexOuter.FindStringSubmatch(line)
	if len(arrOuter) != 3 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
		return nil
	}

	arrInner := regexInner.FindStringSubmatch(arrOuter[2])
	if len(arrInner) != 4 || arrInner[0] == "" {
		return nil
	}

	name, path, url := arrOuter[1], "", ""
	if arrInner[3] == "" {
		path, url = strings.TrimSpace(arrInner[1]), strings.TrimSpace(arrInner[2])
	} else {
		path = strings.TrimSpace(arrInner[3])
	}
	if url == "" {
		url = getLangURL(path)
	}

	if name == "" || path == "" || url == "" {
		return nil
	}

	return &get3w.Lang{
		Name: name,
		Path: path,
		URL:  url,
	}
}

func getLangs(data string) []*get3w.Lang {
	langs := []*get3w.Lang{}

	if data == "" {
		return langs
	}

	lines := strings.Split(data, "\n")

	for _, line := range lines {
		if !strings.HasPrefix(strings.TrimSpace(line), "*") {
			continue
		}

		lang := getLang(line)
		if lang == nil {
			continue
		}

		langs = append(langs, lang)
	}

	return langs
}

func getLangURL(path string) string {
	if path == "" || path == "." || path == "/" {
		return "/"
	}
	return "/" + strings.Trim(path, "/")
}

// marshalLang parse page lang slice to string
func marshalLang(langs []*get3w.Lang) string {
	retval := ""
	for _, lang := range langs {
		line := ""
		if lang.URL == getLangURL(lang.Path) {
			line = fmt.Sprintf("* [%s](%s)\n", lang.Name, lang.Path)
		} else {
			line = fmt.Sprintf(`* [%s](%s "%s")\n`, lang.Name, lang.Path, lang.URL)
		}
		retval += line + "\n"
	}

	return retval + "\n"
}
