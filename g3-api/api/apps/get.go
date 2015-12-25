package apps

import (
	"net/http"

	"github.com/get3w/get3w/g3-api/pkg/api"
	"github.com/bairongsoft/get3w-utils/dao"
	"github.com/labstack/echo"
)

// Get app
func Get(c *echo.Context) error {
	owner := c.Param("owner")
	name := c.Param("name")

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	app, err := dao.NewAppDAO().GetApp(owner, name)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil || !api.IsSelf(c, app.Owner) {
		return api.ErrorNotFound(c, nil)
	}

	return c.JSON(http.StatusOK, app)
}
