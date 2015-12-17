package storage

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetSiteLinksByString(t *testing.T) {
	links := getSiteLinksByString([]byte(`# Links

* [Homepage](index.yml 'index.html')
* [No](menu, noslider, footer "no.html")
* [Slider](slider/index.yml "slider/index.html")
    * [Left](slider/left.yml "slider/left.html")
    * [Right](slider/right.yml)
        * [Left](slider/left.yml "slider/left.html")
        * [Right](slider/right.yml)
* [Slider](slider/index.yml "slider/index.html")
  `))

	assert.Equal(t, 4, len(links))
	assert.Equal(t, "menu, noslider, footer", links[1].Path)
	assert.Equal(t, "no.html", links[1].URL)
	assert.Equal(t, 2, len(links[2].Children))
}
