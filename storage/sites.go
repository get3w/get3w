package storage

import (
	"fmt"
	"path"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

func loadSites(s Storage) ([]*get3w.Site, *get3w.Site) {
	sites := []*get3w.Site{}

	path := s.GetRootKey(KeySites)
	if s.IsExist(path) {
		data, _ := s.Read(path)

		lines := strings.Split(string(data), "\n")

		for _, line := range lines {
			if !strings.HasPrefix(strings.TrimSpace(line), "*") {
				continue
			}

			site := getSite(line)
			if site == nil {
				continue
			}

			sites = append(sites, site)
		}
	}

	var defaultSite *get3w.Site
	if len(sites) == 0 {
		sites = append(sites, &get3w.Site{
			Name: "default",
			Path: "",
			URL:  "",
		})
	} else {
		for _, site := range sites {
			if site.Path == "" {
				defaultSite = site
				break
			}
		}
	}

	if defaultSite == nil {
		defaultSite = sites[0]
	}

	return sites, defaultSite
}

// EachSite trigger callback in each site
func (parser *Parser) EachSite(callback func()) {
	for _, site := range parser.Sites {
		parser.Current = site
		callback()
	}
	parser.Current = parser.Default
}

func getSite(line string) *get3w.Site {
	arrOuter := regexOuter.FindStringSubmatch(line)
	if len(arrOuter) != 3 || arrOuter[0] == "" || arrOuter[1] == "" || arrOuter[2] == "" {
		return nil
	}

	arrInner := regexInner.FindStringSubmatch(arrOuter[2])
	if len(arrInner) != 4 || arrInner[0] == "" {
		return nil
	}

	name, p, url := arrOuter[1], "", ""
	if arrInner[3] == "" {
		p, url = path.Clean(strings.TrimSpace(arrInner[1])), strings.TrimSpace(arrInner[2])
	} else {
		p = path.Clean(strings.TrimSpace(arrInner[3]))
	}
	if p == "." {
		p = ""
	}
	if url == "" {
		url = getSiteURL(p)
	}

	if name == "" {
		return nil
	}

	return &get3w.Site{
		Name: name,
		Path: p,
		URL:  url,
	}
}

func getSiteURL(p string) string {
	if p == "" {
		return ""
	}
	return "/" + p
}

// marshalSite parse page site slice to string
func marshalSite(sites []*get3w.Site) string {
	retval := ""
	for _, site := range sites {
		line := ""
		if site.URL == getSiteURL(site.Path) {
			line = fmt.Sprintf("* [%s](%s)\n", site.Name, site.Path)
		} else {
			line = fmt.Sprintf(`* [%s](%s "%s")\n`, site.Name, site.Path, site.URL)
		}
		retval += line + "\n"
	}

	return retval + "\n"
}
